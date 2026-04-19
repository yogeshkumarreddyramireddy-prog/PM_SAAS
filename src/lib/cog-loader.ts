import * as GeoTIFF from 'geotiff';
import proj4 from 'proj4';

// Register common UTM Zone 32N definition (De Hattemse use case)
proj4.defs('EPSG:32632', '+proj=utm +zone=32 +datum=WGS84 +units=m +no_defs');

// ─── Tile helpers ─────────────────────────────────────────────────────────────

/** Convert a Mapbox slippy-tile (x, y, z) to WGS84 lon/lat bounding box */
function tileToBBox(x: number, y: number, z: number): [number, number, number, number] {
  const n = Math.PI - (2 * Math.PI * y) / Math.pow(2, z);
  const north = (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
  const south = (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n - (2 * Math.PI) / Math.pow(2, z)) - Math.exp(-(n - (2 * Math.PI) / Math.pow(2, z)))));
  const west  = (x / Math.pow(2, z)) * 360 - 180;
  const east  = ((x + 1) / Math.pow(2, z)) * 360 - 180;
  return [west, south, east, north];
}

// ─── COGLoader ────────────────────────────────────────────────────────────────

/**
 * Streams Cloud Optimized GeoTIFF tiles from a presigned URL using geotiff.js
 * byte-range requests.
 *
 * Handles:
 *  • Any projected CRS (UTM, Web Mercator, etc.) via proj4 reprojection
 *  • Float32 reflectance data (0–1 range) — not crushed by /255 normalization
 *  • 8-bit and 16-bit integer data
 *  • 4-band RGB+Alpha and 4/5-band multispectral sensors
 */
export class COGLoader {
  private tiff: GeoTIFF.GeoTIFF | null = null;
  private image: GeoTIFF.GeoTIFFImage | null = null;
  private url: string;

  // Geotransform (native CRS units)
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

    this.tiff  = await GeoTIFF.fromUrl(this.url, { allowFullFile: false });
    this.image = await this.tiff.getImage();

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
    // geotiff.js exposes sample format: 1=uint, 2=int, 3=float
    const sf = (this.image as any).fileDirectory?.SampleFormat;
    const sf0 = Array.isArray(sf) ? sf[0] : sf;
    this.isFloat32 = sf0 === 3;     // IEEE floating point

    // CRS reprojection setup via proj4
    // geotiff.js exposes the EPSG code through geoKeyDirectory
    const geoKeys = (this.image as any).geoKeyDirectory || {};
    const epsgCode = geoKeys.ProjectedCSTypeGeoKey || geoKeys.GeographicTypeGeoKey;
    this.epsgCode = epsgCode || null;

    if (this.epsgCode && this.epsgCode !== 4326) {
      try {
        const sourceDef = `EPSG:${this.epsgCode}`;
        const destDef   = 'WGS84';

        // Check if we have a definition for this EPSG. 
        // If not, we'll try to use a generic UTM definition if it looks like UTM.
        if (!proj4.defs(sourceDef)) {
            console.warn(`[COGLoader] No definition for EPSG:${this.epsgCode}, trying to identify UTM zone...`);
            // Simple heuristic for UTM zones (EPSG 326xx or 327xx)
            if (this.epsgCode >= 32601 && this.epsgCode <= 32660) {
                const zone = this.epsgCode - 32600;
                proj4.defs(sourceDef, `+proj=utm +zone=${zone} +datum=WGS84 +units=m +no_defs`);
            } else if (this.epsgCode >= 32701 && this.epsgCode <= 32760) {
                const zone = this.epsgCode - 32700;
                proj4.defs(sourceDef, `+proj=utm +zone=${zone} +south +datum=WGS84 +units=m +no_defs`);
            } else if (this.epsgCode === 3857) {
                proj4.defs('EPSG:3857', '+proj=merc +a=6378137 +b=6378137 +lat_ts=0.0 +lon_0=0.0 +x_0=0.0 +y_0=0 +k=1.0 +units=m +nadgrids=@null +wktext +no_defs');
            }
        }

        // Store a forward projector: WGS84 lon/lat → native CRS
        this.project = (lon: number, lat: number) => {
          return proj4(destDef, sourceDef, [lon, lat]);
        };

        console.log(`[COGLoader] CRS EPSG:${this.epsgCode} initialized successfully.`);
      } catch (e) {
        console.warn(`[COGLoader] Failed to initialize projection for EPSG:${this.epsgCode}`, e);
        this.project = null;
      }
    } else {
      this.project = null;
      console.log('[COGLoader] CRS is WGS84 (geographic) or unknown.');
    }

    console.log(`[COGLoader] init: origin=(${this.originX}, ${this.originY}) res=(${this.pixelWidth}, ${this.pixelHeight}) size=${this.imgWidth}×${this.imgHeight} bands=${this.bandCount} float32=${this.isFloat32}`);
  }

  // ─── getTile ───────────────────────────────────────────────────────────────

  async getTile(x: number, y: number, z: number, tileSize: number = 256): Promise<ImageData | null> {
    await this.init();
    if (!this.image) return null;

    try {
      const [minLon, minLat, maxLon, maxLat] = tileToBBox(x, y, z);
      const window = this.geoBBoxToPixelWindow(minLon, minLat, maxLon, maxLat);

      // Skip tiles completely outside image bounds
      if (
        window[0] >= this.imgWidth  || window[1] >= this.imgHeight ||
        window[2] <= 0              || window[3] <= 0
      ) {
        return null;
      }

      // Clamp to image extents
      const clamped: [number, number, number, number] = [
        Math.max(0, window[0]),
        Math.max(0, window[1]),
        Math.min(this.imgWidth,  window[2]),
        Math.min(this.imgHeight, window[3]),
      ];

      const raster = await this.image.readRasters({
        window:    clamped,
        width:     tileSize,
        height:    tileSize,
        interleave: false,
      });

      const rgba = this.rastersToRGBA(raster, tileSize);
      return new ImageData(rgba, tileSize, tileSize);
    } catch (err) {
      console.error('[COGLoader] getTile error:', err);
      return null;
    }
  }

  // ─── Coordinate conversion ────────────────────────────────────────────────

  /**
   * Converts a WGS84 lon/lat bounding box → pixel window in the image's CRS.
   * Handles geographic and all projected CRS (UTM, Web Mercator, etc.)
   */
  private geoBBoxToPixelWindow(
    minLon: number, minLat: number, maxLon: number, maxLat: number
  ): [number, number, number, number] {

    let pMinX: number, pMinY: number, pMaxX: number, pMaxY: number;

    if (this.project) {
      // Reproject all four corners, then take the outer bbox
      const corners = [
        this.project(minLon, minLat),
        this.project(maxLon, minLat),
        this.project(minLon, maxLat),
        this.project(maxLon, maxLat),
      ];
      pMinX = Math.min(...corners.map(c => c[0]));
      pMaxX = Math.max(...corners.map(c => c[0]));
      pMinY = Math.min(...corners.map(c => c[1]));
      pMaxY = Math.max(...corners.map(c => c[1]));
    } else {
      pMinX = minLon; pMaxX = maxLon;
      pMinY = minLat; pMaxY = maxLat;
    }

    // pixelWidth > 0 (left→right), pixelHeight < 0 (top→bottom)
    const xMin = Math.round((pMinX - this.originX) / this.pixelWidth);
    const xMax = Math.round((pMaxX - this.originX) / this.pixelWidth);
    // originY is the TOP edge; subtract to go down
    const yMin = Math.round((this.originY - pMaxY) / Math.abs(this.pixelHeight));
    const yMax = Math.round((this.originY - pMinY) / Math.abs(this.pixelHeight));

    return [xMin, yMin, xMax, yMax];
  }

  // ─── RGBA packing ─────────────────────────────────────────────────────────

  /**
   * Converts raw raster bands into a WebGL-compatible RGBA Uint8ClampedArray.
   *
   * Band layout packed into RGBA texture:
   *   R → logical Red (band 0)
   *   G → logical Green (band 1)
   *   B → logical Blue / NIR-proxy (band 2)
   *   A → NIR (band 3 if ≥ 4 bands, else band 0)
   *
   * Float32 reflectance (0.0–1.0 range) is scaled ×255 directly.
   * 16-bit integer is scaled from 65535 → 255.
   * 8-bit is copied as-is.
   *
   * For RGB COGs with an alpha mask in band 4: the mask is used as real alpha.
   */
  private rastersToRGBA(rasters: any, size: number): Uint8ClampedArray {
    const rgba  = new Uint8ClampedArray(size * size * 4);
    const bands = Array.isArray(rasters) ? rasters : [rasters];
    const n     = bands.length;

    const r   = bands[0];                     // Red
    const g   = bands[1] ?? bands[0];          // Green
    // For 5-band multispectral (no blue): pack NIR into Blue slot, RedEdge into Alpha
    // For 4-band RGB+alpha: pack R,G,B into RGB, alpha mask into Alpha
    // For 3-band RGB: pack R,G,B, alpha=255
    let bPacked: any;  // Band to store in Blue channel of texture
    let aPacked: any;  // Band to store in Alpha channel of texture

    if (n >= 5) {
      // 5-band: [Red, Green, NIR, RedEdge, Mask] — no blue channel
      bPacked = bands[2]; // NIR → Blue slot
      aPacked = bands[3]; // RedEdge → Alpha slot
    } else if (n >= 4) {
      // 4-band: either [R,G,B,NIR] multispectral or [R,G,B,Alpha] RGB
      bPacked = bands[2]; // Blue or NIR
      aPacked = bands[3]; // NIR or Alpha mask
    } else if (n >= 3) {
      // 3-band RGB
      bPacked = bands[2];
      aPacked = null; // Will be set to 255 (fully opaque)
    } else {
      bPacked = bands[0];
      aPacked = null;
    }

    // Determine per-band scale factor:
    //   Float32 reflectance : ×255  (values sit in 0–1)
    //   16-bit integer       : 255 / 65535
    //   8-bit integer        : 1.0
    let scale: number;
    if (this.isFloat32) {
      scale = 255;   // 0.13 reflectance → 33 — full range preserved in shader via uniform
    } else if (this.is16Bit) {
      scale = 255 / 65535;
    } else {
      scale = 1;
    }

    for (let i = 0; i < size * size; i++) {
      rgba[i * 4]     = Math.round((r[i]          ?? 0) * scale);
      rgba[i * 4 + 1] = Math.round((g[i]          ?? 0) * scale);
      rgba[i * 4 + 2] = Math.round((bPacked?.[i]  ?? 0) * scale);
      rgba[i * 4 + 3] = aPacked ? Math.round((aPacked[i] ?? 0) * scale) : 255;
    }

    return rgba;
  }

  /** Number of spectral bands (available after init()) */
  getBandCount(): number { return this.bandCount; }

  /** True if bands contain floating-point reflectance values */
  getIsFloat32(): boolean { return this.isFloat32; }

  /**
   * Returns the COG's bounding box in WGS84 [west, south, east, north].
   * Must be called after init() resolves.
   * Returns null if the image has not been initialized yet.
   */
  getBoundsWGS84(): [number, number, number, number] | null {
    if (!this.image) return null;

    // The four corners of the image in native CRS
    const x0 = this.originX;
    const y0 = this.originY;
    const x1 = this.originX + this.pixelWidth  * this.imgWidth;
    const y1 = this.originY + this.pixelHeight * this.imgHeight; // pixelHeight is negative

    const minX = Math.min(x0, x1);
    const maxX = Math.max(x0, x1);
    const minY = Math.min(y0, y1);
    const maxY = Math.max(y0, y1);

    if (this.project && this.epsgCode) {
      try {
        const sourceDef = `EPSG:${this.epsgCode}`;
        const sw = proj4(sourceDef, 'WGS84', [minX, minY]);
        const ne = proj4(sourceDef, 'WGS84', [maxX, maxY]);
        return [sw[0], sw[1], ne[0], ne[1]];
      } catch (e) {
        console.error('[COGLoader] Failed to invert projection for bounds:', e);
        return null;
      }
    } else {
      return [minX, minY, maxX, maxY];
    }
  }
}
