import * as GeoTIFF from 'geotiff';
import proj4 from 'proj4';
import type { RawWindowData } from './zonalStats';

// Register common UTM Zone definitions upfront for fast access
proj4.defs('EPSG:32631', '+proj=utm +zone=31 +datum=WGS84 +units=m +no_defs');
proj4.defs('EPSG:32632', '+proj=utm +zone=32 +datum=WGS84 +units=m +no_defs');
proj4.defs('EPSG:32633', '+proj=utm +zone=33 +datum=WGS84 +units=m +no_defs');

// ─── COGLoader ────────────────────────────────────────────────────────────────

/**
 * Streams Cloud Optimized GeoTIFF data from a presigned URL using geotiff.js
 * byte-range requests.
 *
 * Primary rendering strategy: `getFullImage()` reads a COG overview (small
 * pre-rendered thumbnail) and returns an ImageData + WGS84 bounds tuple
 * that can be passed directly to a Deck.GL BitmapLayer.
 *
 * Handles:
 *  • Any projected CRS (UTM, Web Mercator, etc.) via proj4 reprojection
 *  • Float32 reflectance data (0–1 range)
 *  • 8-bit and 16-bit integer data
 *  • 4-band RGB+Alpha and 4/5-band multispectral sensors
 */
export class COGLoader {
  private tiff: GeoTIFF.GeoTIFF | null = null;
  private image: GeoTIFF.GeoTIFFImage | null = null;
  private url: string;

  // Geotransform (native CRS units — from the full-res IFD)
  private originX = 0;
  private originY = 0;
  private pixelWidth = 0;
  private pixelHeight = 0;
  private imgWidth = 0;
  private imgHeight = 0;
  private bandCount = 0;

  // Data type flags (set during init)
  private isFloat32 = false;
  private is16Bit   = false;

  // EPSG code read from the GeoTIFF's metadata (e.g. 32632 for UTM zone 32N)
  private epsgCode: number | null = null;

  // proj4 reprojection function (lon/lat → native CRS), null if already geographic
  private project: ((lon: number, lat: number) => [number, number]) | null = null;

  constructor(url: string) {
    this.url = url;
  }

  // ─── init ──────────────────────────────────────────────────────────────────

  async init() {
    if (this.tiff) return;

    console.log('[COGLoader] Starting init, fetching TIFF header...');
    this.tiff  = await GeoTIFF.fromUrl(this.url, { allowFullFile: false });
    this.image = await this.tiff.getImage();
    console.log('[COGLoader] TIFF header loaded OK');

    // Geotransform
    const resolution = this.image.getResolution();
    const origin     = this.image.getOrigin();
    this.originX    = origin[0];
    this.originY    = origin[1];
    this.pixelWidth  = resolution[0];
    this.pixelHeight = resolution[1];   // negative = top-down
    this.imgWidth    = this.image.getWidth();
    this.imgHeight   = this.image.getHeight();
    this.bandCount   = this.image.getSamplesPerPixel();

    // Data type detection
    const bps = this.image.getBitsPerSample();
    const bps0 = Array.isArray(bps) ? bps[0] : bps;
    this.is16Bit   = bps0 === 16;
    const sf = (this.image as any).fileDirectory?.SampleFormat;
    const sf0 = Array.isArray(sf) ? sf[0] : sf;
    this.isFloat32 = sf0 === 3;     // IEEE floating point

    // CRS reprojection setup via proj4
    const geoKeys = (this.image as any).geoKeyDirectory || {};
    const fileDir  = (this.image as any).fileDirectory   || {};
    const epsgCode =
      geoKeys.ProjectedCSTypeGeoKey        ||
      geoKeys.ProjectedCRSGeoKey           ||
      geoKeys.GeographicTypeGeoKey         ||
      fileDir.EPSG                         ||
      null;
    this.epsgCode = epsgCode || null;

    // Auto-detect UTM from coordinate magnitudes
    const looksLikeUTM = Math.abs(this.originX) > 180 || Math.abs(this.originY) > 90;
    if (looksLikeUTM && (!this.epsgCode || this.epsgCode === 4326)) {
      const isNorth = this.originY > 0;
      let zone: number;
      if (this.originX >= 100000 && this.originX <= 900000) {
        zone = this.originX < 600000 ? 32 : 33;
      } else {
        zone = 32;
      }
      const autoEpsg = isNorth ? 32600 + zone : 32700 + zone;
      console.warn(`[COGLoader] Origin (${this.originX.toFixed(0)}, ${this.originY.toFixed(0)}) looks like UTM. EPSG from tags: ${this.epsgCode ?? 'none'}, auto-guessing EPSG:${autoEpsg} (zone ${zone}${isNorth ? 'N' : 'S'})`);
      this.epsgCode = autoEpsg;
    }

    if (this.epsgCode && this.epsgCode !== 4326) {
      try {
        const sourceDef = `EPSG:${this.epsgCode}`;
        const destDef   = 'WGS84';

        if (!proj4.defs(sourceDef)) {
          console.warn(`[COGLoader] No proj4 def for EPSG:${this.epsgCode}, registering...`);
          if (this.epsgCode >= 32601 && this.epsgCode <= 32660) {
            const zone = this.epsgCode - 32600;
            proj4.defs(sourceDef, `+proj=utm +zone=${zone} +datum=WGS84 +units=m +no_defs`);
          } else if (this.epsgCode >= 32701 && this.epsgCode <= 32760) {
            const zone = this.epsgCode - 32700;
            proj4.defs(sourceDef, `+proj=utm +zone=${zone} +south +datum=WGS84 +units=m +no_defs`);
          } else {
            throw new Error(`Unsupported EPSG:${this.epsgCode} — cannot auto-register`);
          }
        }

        this.project = (lon: number, lat: number) => proj4(destDef, sourceDef, [lon, lat]) as [number, number];

        const testWgs84 = proj4(sourceDef, destDef, [this.originX, this.originY]);
        console.log(`[COGLoader] CRS EPSG:${this.epsgCode} → WGS84 origin check: lon=${testWgs84[0].toFixed(5)}, lat=${testWgs84[1].toFixed(5)}`);
      } catch (e) {
        console.warn(`[COGLoader] Failed to init projection for EPSG:${this.epsgCode}`, e);
        this.project = null;
      }
    } else {
      this.project = null;
      if (!looksLikeUTM) {
        console.log('[COGLoader] CRS is WGS84 — no reprojection needed.');
      }
    }

    console.log(`[COGLoader] init complete: origin=(${this.originX}, ${this.originY}) size=${this.imgWidth}×${this.imgHeight} bands=${this.bandCount} float32=${this.isFloat32}`);
  }

  // ─── getFullImage ──────────────────────────────────────────────────────────
  /**
   * Reads a COG overview image (pre-rendered thumbnail stored inside the COG)
   * and returns pixel data + WGS84 bounds.
   *
   * COGs store progressively smaller copies of the image (overviews/pyramids).
   * We pick a small overview (~256-1024px) that can be fetched in a single
   * byte-range request, rather than reading the full 218 MB raster.
   */
  async getFullImage(targetSize = 1024): Promise<{ imageData: ImageData; bounds: [number, number, number, number] } | null> {
    await this.init();
    if (!this.tiff || !this.image) return null;

    const bounds = this.getBoundsWGS84();
    if (!bounds) {
      console.error('[COGLoader] Cannot compute WGS84 bounds');
      return null;
    }

    try {
      // ── Find the best overview ──────────────────────────────────────────
      // COGs store the full-res image as IFD 0, then progressively smaller
      // overviews as IFD 1, 2, 3, etc. We want one close to targetSize.
      const imageCount = await this.tiff.getImageCount();
      console.log(`[COGLoader] COG has ${imageCount} IFDs (1 full-res + ${imageCount - 1} overviews)`);

      let bestImage = this.image;   // fallback: full res
      let bestW = this.imgWidth;
      let bestH = this.imgHeight;
      let bestIdx = 0;

      for (let i = 0; i < imageCount; i++) {
        const img = await this.tiff.getImage(i);
        const w = img.getWidth();
        const h = img.getHeight();
        console.log(`[COGLoader]   IFD ${i}: ${w}×${h}`);

        // Pick the smallest overview that is >= targetSize on its long edge,
        // or the smallest available if all are smaller.
        const longEdge = Math.max(w, h);
        const bestLongEdge = Math.max(bestW, bestH);

        if (longEdge >= targetSize && longEdge < bestLongEdge) {
          bestImage = img;
          bestW = w;
          bestH = h;
          bestIdx = i;
        } else if (bestLongEdge > targetSize && longEdge < bestLongEdge) {
          // Current best is too big, this one is smaller → prefer it
          bestImage = img;
          bestW = w;
          bestH = h;
          bestIdx = i;
        }
      }

      // If even the smallest overview is too big, use the very last (smallest) IFD
      if (Math.max(bestW, bestH) > targetSize * 2 && imageCount > 1) {
        const lastImg = await this.tiff.getImage(imageCount - 1);
        bestImage = lastImg;
        bestW = lastImg.getWidth();
        bestH = lastImg.getHeight();
        bestIdx = imageCount - 1;
      }

      console.log(`[COGLoader] Using IFD ${bestIdx} (${bestW}×${bestH}) for rendering`);

      // ── Read the overview's pixel data ──────────────────────────────────
      // Read at native resolution of the overview — NO resampling needed.
      // This is fast because the overview is small (e.g. 289×189 = ~55K pixels).
      console.log(`[COGLoader] Reading rasters from overview ${bestIdx}...`);
      const rasterResult = await bestImage.readRasters({ interleave: false });
      console.log(`[COGLoader] Rasters read OK. Band count: ${(rasterResult as any).length || 'N/A'}`);

      // Detect data type from the ACTUAL array returned by readRasters.
      // The SampleFormat tag is often missing in overview IFDs, so we check
      // the typed array constructor instead — this is 100% reliable.
      const bandsArr = Array.isArray(rasterResult) ? rasterResult : [rasterResult];
      const ovIsFloat32 = bandsArr[0] instanceof Float32Array || bandsArr[0] instanceof Float64Array;
      const ovBps = bestImage.getBitsPerSample();
      const ovBps0 = Array.isArray(ovBps) ? ovBps[0] : ovBps;
      const ovIs16Bit = !ovIsFloat32 && ovBps0 === 16;
      console.log(`[COGLoader] Data type: Float32=${ovIsFloat32}, 16bit=${ovIs16Bit}, arrayType=${bandsArr[0]?.constructor?.name}`);

      const rgba = this.rastersToRGBAStatic(rasterResult, bestW, bestH, ovIsFloat32, ovIs16Bit);
      console.log(`[COGLoader] RGBA packed: ${rgba.length} bytes (${bestW}×${bestH}×4)`);

      const imageData = new ImageData(rgba, bestW, bestH);
      console.log(`[COGLoader] ✅ Full image ready: ${bestW}×${bestH}, bounds=[${bounds.map(b => b.toFixed(6)).join(', ')}]`);

      return { imageData, bounds };
    } catch (err) {
      console.error('[COGLoader] ❌ getFullImage error:', err);
      return null;
    }
  }

  // ─── getWindowImage ────────────────────────────────────────────────────────
  /**
   * Viewport-driven read: fetches only the pixels covering the given WGS84
   * bbox, picking the highest-resolution COG overview whose windowed read
   * stays within targetMaxDim on its longest edge.
   *
   * Returns RGBA-packed pixel data + WGS84 bounds matching the *actual*
   * native pixels read (snapped to the chosen IFD's pixel boundaries).
   *
   * Behaviour:
   *  • At low zoom (whole farm visible) → picks a small overview, ~1 fetch
   *  • At high zoom (close inspection)   → picks IFD 0 windowed to the area
   *  • Always close to "1 source pixel ≈ 1 screen pixel" → no GPU upscaling
   */
  async getWindowImage(
    bboxWGS84: [number, number, number, number],
    targetMaxDim: number
  ): Promise<{ imageData: ImageData; bounds: [number, number, number, number] } | null> {
    await this.init();
    if (!this.tiff || !this.image) return null;

    const [west, south, east, north] = bboxWGS84;

    // Project viewport corners to native CRS (sample 4 corners since the
    // bbox edges aren't straight lines in projected space).
    let nMinX: number, nMaxX: number, nMinY: number, nMaxY: number;
    if (this.project) {
      const sw = this.project(west, south);
      const ne = this.project(east, north);
      const nw = this.project(west, north);
      const se = this.project(east, south);
      nMinX = Math.min(sw[0], ne[0], nw[0], se[0]);
      nMaxX = Math.max(sw[0], ne[0], nw[0], se[0]);
      nMinY = Math.min(sw[1], ne[1], nw[1], se[1]);
      nMaxY = Math.max(sw[1], ne[1], nw[1], se[1]);
    } else {
      nMinX = west; nMaxX = east; nMinY = south; nMaxY = north;
    }

    // COG full extent in native (pixelHeight is negative for top-down rasters)
    const cogX0 = this.originX;
    const cogX1 = this.originX + this.pixelWidth  * this.imgWidth;
    const cogY0 = this.originY;
    const cogY1 = this.originY + this.pixelHeight * this.imgHeight;
    const cogMinX = Math.min(cogX0, cogX1);
    const cogMaxX = Math.max(cogX0, cogX1);
    const cogMinY = Math.min(cogY0, cogY1);
    const cogMaxY = Math.max(cogY0, cogY1);

    // Clip viewport to COG extent
    const clipMinX = Math.max(nMinX, cogMinX);
    const clipMaxX = Math.min(nMaxX, cogMaxX);
    const clipMinY = Math.max(nMinY, cogMinY);
    const clipMaxY = Math.min(nMaxY, cogMaxY);
    if (clipMaxX <= clipMinX || clipMaxY <= clipMinY) return null;

    // Walk IFDs from highest res to lowest, pick the first whose windowed
    // dimensions fit within targetMaxDim.
    const imageCount = await this.tiff.getImageCount();
    let chosenImg = this.image;
    let chosenIdx = 0;
    let chosenW = this.imgWidth;
    let chosenH = this.imgHeight;
    let chosenFits = false;

    for (let i = 0; i < imageCount; i++) {
      const img = await this.tiff.getImage(i);
      const w = img.getWidth();
      const h = img.getHeight();
      const pxW = (cogMaxX - cogMinX) / w;
      const pxH = (cogMaxY - cogMinY) / h;
      const winW = (clipMaxX - clipMinX) / pxW;
      const winH = (clipMaxY - clipMinY) / pxH;
      if (Math.max(winW, winH) <= targetMaxDim) {
        chosenImg = img;
        chosenIdx = i;
        chosenW = w;
        chosenH = h;
        chosenFits = true;
        break;
      }
    }

    // If even the smallest overview is larger than budget (unusual — would
    // mean the user is viewing a huge area), fall back to the smallest IFD.
    if (!chosenFits && imageCount > 1) {
      const smallest = await this.tiff.getImage(imageCount - 1);
      chosenImg = smallest;
      chosenIdx = imageCount - 1;
      chosenW = smallest.getWidth();
      chosenH = smallest.getHeight();
    }

    // Pixel grid math in the chosen IFD. Every IFD shares (cogX0, cogY0) as
    // its top-left corner; only the pixel size scales.
    const ifdPxWidthSigned  = (cogX1 - cogX0) / chosenW;
    const ifdPxHeightSigned = (cogY1 - cogY0) / chosenH;
    const absIfdPxH = Math.abs(ifdPxHeightSigned);

    const colMinF = (clipMinX - cogX0) / ifdPxWidthSigned;
    const colMaxF = (clipMaxX - cogX0) / ifdPxWidthSigned;
    const rowMinF = (cogY0 - clipMaxY) / absIfdPxH;
    const rowMaxF = (cogY0 - clipMinY) / absIfdPxH;

    const colMin = Math.max(0, Math.floor(colMinF));
    const colMax = Math.min(chosenW, Math.ceil(colMaxF));
    const rowMin = Math.max(0, Math.floor(rowMinF));
    const rowMax = Math.min(chosenH, Math.ceil(rowMaxF));
    if (colMax <= colMin || rowMax <= rowMin) return null;

    const winW = colMax - colMin;
    const winH = rowMax - rowMin;

    let rasters: any;
    try {
      rasters = await chosenImg.readRasters({
        window: [colMin, rowMin, colMax, rowMax],
        interleave: false,
      });
    } catch (err) {
      console.error('[COGLoader] getWindowImage readRasters error:', err);
      return null;
    }

    const bandsArr = Array.isArray(rasters) ? rasters : [rasters];
    const isFloat32 = bandsArr[0] instanceof Float32Array || bandsArr[0] instanceof Float64Array;
    const bps = chosenImg.getBitsPerSample();
    const bps0 = Array.isArray(bps) ? bps[0] : bps;
    const is16Bit = !isFloat32 && bps0 === 16;

    const rgba = this.rastersToRGBAStatic(rasters, winW, winH, isFloat32, is16Bit);
    const imageData = new ImageData(rgba, winW, winH);

    // Bounds of the snapped native window (slightly larger than the request)
    const winNX0 = cogX0 + colMin * ifdPxWidthSigned;
    const winNX1 = cogX0 + colMax * ifdPxWidthSigned;
    const winNY0 = cogY0 + rowMin * ifdPxHeightSigned;
    const winNY1 = cogY0 + rowMax * ifdPxHeightSigned;
    const winMinX = Math.min(winNX0, winNX1);
    const winMaxX = Math.max(winNX0, winNX1);
    const winMinY = Math.min(winNY0, winNY1);
    const winMaxY = Math.max(winNY0, winNY1);

    let bounds: [number, number, number, number];
    if (this.project && this.epsgCode) {
      const sourceDef = `EPSG:${this.epsgCode}`;
      const sw = proj4(sourceDef, 'WGS84', [winMinX, winMinY]);
      const ne = proj4(sourceDef, 'WGS84', [winMaxX, winMaxY]);
      if (isNaN(sw[0]) || isNaN(ne[0])) return null;
      bounds = [sw[0], sw[1], ne[0], ne[1]];
    } else {
      bounds = [winMinX, winMinY, winMaxX, winMaxY];
    }

    return { imageData, bounds };
  }

  // ─── RGBA packing (static — works with any image, not just this.image) ────

  private rastersToRGBAStatic(
    rasters: any,
    width: number,
    height: number,
    isFloat32: boolean,
    is16Bit: boolean
  ): Uint8ClampedArray {
    const size  = width * height;
    const rgba  = new Uint8ClampedArray(size * 4);
    const bands = Array.isArray(rasters) ? rasters : [rasters];
    const n     = bands.length;

    // Band packing into RGBA texture for the vegetation index shader:
    //   R channel → band 0 (Red)
    //   G channel → band 1 (Green)
    //   B channel → band 2 (NIR for 5-band / Blue for 3-4 band)
    //   A channel → band 3 (RedEdge for 5-band / NIR for 4-band)
    //
    // CRITICAL: Alpha is ALWAYS 255 for visibility. The shader reads the
    // spectral data from R/G/B/A channels; we cannot use alpha for opacity
    // because low reflectance values (0.03) would round to 0 → transparent.
    const r   = bands[0];
    const g   = bands[1] ?? bands[0];
    let bPacked: any;
    let aPacked: any;  // Band stored in alpha channel (for shader access, NOT opacity)

    if (n >= 5) {
      bPacked = bands[2]; // NIR → Blue slot
      aPacked = bands[3]; // RedEdge → Alpha slot (but forced opaque below)
    } else if (n >= 4) {
      bPacked = bands[2];
      aPacked = bands[3];
    } else if (n >= 3) {
      bPacked = bands[2];
      aPacked = null;
    } else {
      bPacked = bands[0];
      aPacked = null;
    }

    let scale: number;
    if (isFloat32) {
      scale = 255;
    } else if (is16Bit) {
      scale = 255 / 65535;
    } else {
      scale = 1;
    }

    for (let i = 0; i < size; i++) {
      const rv = (r[i]         ?? 0) * scale;
      const gv = (g[i]         ?? 0) * scale;
      const bv = (bPacked?.[i] ?? 0) * scale;
      const av = aPacked ? (aPacked[i] ?? 0) * scale : 0;

      rgba[i * 4]     = Math.round(rv);
      rgba[i * 4 + 1] = Math.round(gv);
      rgba[i * 4 + 2] = Math.round(bv);
      rgba[i * 4 + 3] = Math.round(av);

      // Pixel is considered "valid" if any spectral band has data.
      // The VegetationIndexLayer custom shader handles nodata pixels by checking
      // if all spectral channels sum to zero, so we do NOT need to force alpha=255 here.
      // Doing so would permanently destroy the RedEdge data stored in the Alpha channel!
    }

    return rgba;
  }

  /** Number of spectral bands (available after init()) */
  getBandCount(): number { return this.bandCount; }

  /** True if bands contain floating-point reflectance values */
  getIsFloat32(): boolean { return this.isFloat32; }

  /**
   * Reproject a WGS84 lon/lat to the COG's native CRS.
   * Returns null when the COG is already in WGS84 (no reprojection needed).
   * Available after init().
   */
  projectToNative(lon: number, lat: number): [number, number] | null {
    if (this.project) return this.project(lon, lat);
    return null;
  }

  /**
   * Returns the proj4 project function (WGS84 → native CRS) or null.
   * Used by zonal-stats to reproject polygon vertices once, then do fast
   * per-pixel tests entirely in native CRS.
   */
  getProjectFn(): ((lon: number, lat: number) => [number, number]) | null {
    return this.project;
  }

  /**
   * Read a rectangular window from the full-resolution IFD (IFD 0) using
   * byte-range HTTP requests — only the pixels inside the bbox are fetched.
   *
   * @param bboxWGS84 [west, south, east, north] in WGS84 degrees
   * @returns RawWindowData with band arrays and geotransform info, or null on error
   */
  async readWindowRaw(bboxWGS84: [number, number, number, number]): Promise<RawWindowData | null> {
    await this.init();
    if (!this.tiff || !this.image) return null;

    const [west, south, east, north] = bboxWGS84;

    // Convert bbox corners to native CRS
    let nativeMinX: number, nativeMaxX: number, nativeMinY: number, nativeMaxY: number;
    if (this.project) {
      const sw = this.project(west, south);
      const ne = this.project(east, north);
      const nw = this.project(west, north);
      const se = this.project(east, south);
      nativeMinX = Math.min(sw[0], ne[0], nw[0], se[0]);
      nativeMaxX = Math.max(sw[0], ne[0], nw[0], se[0]);
      nativeMinY = Math.min(sw[1], ne[1], nw[1], se[1]);
      nativeMaxY = Math.max(sw[1], ne[1], nw[1], se[1]);
    } else {
      nativeMinX = west;
      nativeMaxX = east;
      nativeMinY = south;
      nativeMaxY = north;
    }

    // pixelHeight is negative (top-down image), pixelWidth is positive
    const absPixelH = Math.abs(this.pixelHeight);

    // Convert native CRS coords to pixel col/row
    // originX/originY is the top-left corner of the image
    const colMinF = (nativeMinX - this.originX) / this.pixelWidth;
    const colMaxF = (nativeMaxX - this.originX) / this.pixelWidth;
    // Y: originY is top, Y decreases going down (pixelHeight < 0)
    const rowMinF = (this.originY - nativeMaxY) / absPixelH;
    const rowMaxF = (this.originY - nativeMinY) / absPixelH;

    // Clamp to image bounds
    const colMin = Math.max(0, Math.floor(colMinF));
    const rowMin = Math.max(0, Math.floor(rowMinF));
    const colMax = Math.min(this.imgWidth,  Math.ceil(colMaxF));
    const rowMax = Math.min(this.imgHeight, Math.ceil(rowMaxF));

    if (colMax <= colMin || rowMax <= rowMin) {
      console.warn('[COGLoader] readWindowRaw: bbox does not overlap raster');
      return null;
    }

    try {
      const rasters = await this.image.readRasters({
        window: [colMin, rowMin, colMax, rowMax],
        interleave: false,
      });

      const bandsArr = Array.isArray(rasters) ? rasters : [rasters];

      // Detect actual data type from typed array (SampleFormat tag may be absent in some IFDs)
      const isFloat32 = bandsArr[0] instanceof Float32Array || bandsArr[0] instanceof Float64Array;
      const bps = this.image.getBitsPerSample();
      const bps0 = Array.isArray(bps) ? bps[0] : bps;
      const is16Bit = !isFloat32 && bps0 === 16;

      // Top-left origin of the window in native CRS
      const originNativeX = this.originX + colMin * this.pixelWidth;
      const originNativeY = this.originY + rowMin * this.pixelHeight; // pixelHeight < 0

      return {
        bands: bandsArr as RawWindowData['bands'],
        width: colMax - colMin,
        height: rowMax - rowMin,
        originNativeX,
        originNativeY,
        pixelWidthNative: Math.abs(this.pixelWidth),
        pixelHeightNative: absPixelH,
        isFloat32,
        is16Bit,
      };
    } catch (err) {
      console.error('[COGLoader] readWindowRaw error:', err);
      return null;
    }
  }

  /**
   * Read the raw band values for the single pixel at the given WGS84 lon/lat.
   * Returns normalized 0–1 float values, or null if the point is outside the raster.
   * Uses a 1×1 window read from the full-resolution IFD — a tiny byte-range request.
   */
  async getPixelAt(lon: number, lat: number): Promise<number[] | null> {
    await this.init();
    if (!this.image) return null;

    let nx: number, ny: number;
    if (this.project) {
      [nx, ny] = this.project(lon, lat);
    } else {
      nx = lon;
      ny = lat;
    }

    const absPixelH = Math.abs(this.pixelHeight);

    // GeoTIFF pixel convention: pixel-is-area (default) → origin is the top-left
    // CORNER of pixel (0,0); pixel-is-point → origin is the CENTER of pixel (0,0).
    // Without adjusting for the latter, every lookup is offset by half a pixel,
    // which causes edge clicks to resolve to the neighboring pixel (the
    // "sand at the edge reads as vegetation" symptom).
    const pixelIsArea = typeof (this.image as any).pixelIsArea === 'function'
      ? (this.image as any).pixelIsArea()
      : true;

    let colF = (nx - this.originX) / this.pixelWidth;
    let rowF = (this.originY - ny) / absPixelH;
    if (!pixelIsArea) {
      colF += 0.5;
      rowF += 0.5;
    }

    const col = Math.floor(colF);
    const row = Math.floor(rowF);

    console.log(
      `[COGLoader.getPixelAt] lng=${lon.toFixed(6)} lat=${lat.toFixed(6)} → ` +
      `native=(${nx.toFixed(2)}, ${ny.toFixed(2)}) → pixel=(${col}, ${row}) ` +
      `[pixelIsArea=${pixelIsArea}, fractional=(${colF.toFixed(3)}, ${rowF.toFixed(3)})]`
    );

    if (col < 0 || col >= this.imgWidth || row < 0 || row >= this.imgHeight) return null;

    try {
      const rasters = await this.image.readRasters({
        window: [col, row, col + 1, row + 1],
        interleave: false,
      });

      const bandsArr = Array.isArray(rasters) ? rasters : [rasters];
      const isFloat32 = bandsArr[0] instanceof Float32Array || bandsArr[0] instanceof Float64Array;
      const bps = this.image.getBitsPerSample();
      const bps0 = Array.isArray(bps) ? bps[0] : bps;
      const is16Bit = !isFloat32 && bps0 === 16;
      const scale = isFloat32 ? 1 : is16Bit ? 1 / 65535 : 1 / 255;

      return bandsArr.map(band => (band[0] ?? 0) * scale);
    } catch (err) {
      console.error('[COGLoader] getPixelAt error:', err);
      return null;
    }
  }

  /**
   * Returns the COG's bounding box in WGS84 [west, south, east, north].
   * Must be called after init() resolves.
   */
  getBoundsWGS84(): [number, number, number, number] | null {
    if (!this.image) return null;

    const x0 = this.originX;
    const y0 = this.originY;
    const x1 = this.originX + this.pixelWidth  * this.imgWidth;
    const y1 = this.originY + this.pixelHeight * this.imgHeight;

    const minX = Math.min(x0, x1);
    const maxX = Math.max(x0, x1);
    const minY = Math.min(y0, y1);
    const maxY = Math.max(y0, y1);

    if (this.project && this.epsgCode) {
      try {
        const sourceDef = `EPSG:${this.epsgCode}`;
        const sw = proj4(sourceDef, 'WGS84', [minX, minY]);
        const ne = proj4(sourceDef, 'WGS84', [maxX, maxY]);
        if (isNaN(sw[0]) || isNaN(sw[1]) || isNaN(ne[0]) || isNaN(ne[1])) {
          console.error('[COGLoader] Projection produced NaN bounds');
          return null;
        }
        console.log(`[COGLoader] Bounds WGS84: [${sw[0].toFixed(6)}, ${sw[1].toFixed(6)}, ${ne[0].toFixed(6)}, ${ne[1].toFixed(6)}]`);
        return [sw[0], sw[1], ne[0], ne[1]];
      } catch (e) {
        console.error('[COGLoader] Failed to project bounds:', e);
        return null;
      }
    } else {
      console.log(`[COGLoader] Bounds (native/WGS84): [${minX.toFixed(6)}, ${minY.toFixed(6)}, ${maxX.toFixed(6)}, ${maxY.toFixed(6)}]`);
      return [minX, minY, maxX, maxY];
    }
  }
}
