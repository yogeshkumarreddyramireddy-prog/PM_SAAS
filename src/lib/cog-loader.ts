import * as GeoTIFF from 'geotiff';

// Web Mercator tile to lat/lng bounding box
function tileToBBox(x: number, y: number, z: number): [number, number, number, number] {
  const n = Math.PI - (2 * Math.PI * y) / Math.pow(2, z);
  const north = (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
  const south = (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n - (2 * Math.PI) / Math.pow(2, z)) - Math.exp(-(n - (2 * Math.PI) / Math.pow(2, z)))));
  const west = (x / Math.pow(2, z)) * 360 - 180;
  const east = ((x + 1) / Math.pow(2, z)) * 360 - 180;
  return [west, south, east, north]; // [minLon, minLat, maxLon, maxLat]
}

/**
 * Utility to fetch and decode tiles from a Cloud Optimized GeoTIFF (COG)
 * using byte-range requests via geotiff.js.
 */
export class COGLoader {
  private tiff: GeoTIFF.GeoTIFF | null = null;
  private image: GeoTIFF.GeoTIFFImage | null = null;
  private url: string;

  // Geotransform parameters (from the GeoTIFF's actual origin + resolution)
  private originX = 0;  // top-left longitude (or projected X)
  private originY = 0;  // top-left latitude (or projected Y)
  private pixelWidth = 0;
  private pixelHeight = 0;
  private imgWidth = 0;
  private imgHeight = 0;
  private bandCount = 0;

  constructor(url: string) {
    this.url = url;
  }

  async init() {
    if (this.tiff) return;

    // geotiff.js performs byte-range requests automatically for COGs
    this.tiff = await GeoTIFF.fromUrl(this.url, { allowFullFile: false });
    this.image = await this.tiff.getImage();

    // Read the geotransform to map pixel↔geographic coordinates
    const [ox, pw, , oy, , ph] = this.image.getResolution();
    const [geoX, geoY] = this.image.getOrigin();

    this.originX = geoX;
    this.originY = geoY;
    this.pixelWidth = pw;
    this.pixelHeight = ph; // typically negative (top-down)
    this.imgWidth = this.image.getWidth();
    this.imgHeight = this.image.getHeight();
    this.bandCount = this.image.getSamplesPerPixel();
  }

  async getTile(x: number, y: number, z: number, tileSize: number = 256) {
    await this.init();
    if (!this.image) return null;

    try {
      const [minLon, minLat, maxLon, maxLat] = tileToBBox(x, y, z);
      const window = this.geoBBoxToPixelWindow(minLon, minLat, maxLon, maxLat);

      // If the tile is completely outside the image bounds, skip it
      if (window[0] >= this.imgWidth || window[1] >= this.imgHeight ||
          window[2] <= 0 || window[3] <= 0) {
        return null;
      }

      // Clamp window to image bounds
      const clamped: [number, number, number, number] = [
        Math.max(0, window[0]),
        Math.max(0, window[1]),
        Math.min(this.imgWidth, window[2]),
        Math.min(this.imgHeight, window[3]),
      ];

      // geotiff.js readRasters uses internal overviews automatically
      const raster = await this.image.readRasters({
        window: clamped,
        width: tileSize,
        height: tileSize,
        interleave: false,
      });

      return this.rastersToRGBA(raster, tileSize);
    } catch (err) {
      console.error('COG Tile Fetch Error:', err);
      return null;
    }
  }

  /**
   * Convert a geographic bbox (WGS84 lon/lat) into pixel coordinates
   * using the image's actual geotransform.
   */
  private geoBBoxToPixelWindow(
    minLon: number, minLat: number, maxLon: number, maxLat: number
  ): [number, number, number, number] {
    // pixelWidth is degrees per pixel in X; pixelHeight is negative (top→bottom)
    const xMin = Math.round((minLon - this.originX) / this.pixelWidth);
    const xMax = Math.round((maxLon - this.originX) / this.pixelWidth);

    // originY is top latitude; pixelHeight is negative, so larger lat = smaller pixel Y
    const yMin = Math.round((this.originY - maxLat) / Math.abs(this.pixelHeight));
    const yMax = Math.round((this.originY - minLat) / Math.abs(this.pixelHeight));

    return [xMin, yMin, xMax, yMax];
  }

  /**
   * Pack multi-band rasters into RGBA bytes.
   * Bands are mapped: R→R, G→G, B→B, NIR→A.
   * If a 5th band (Red-Edge) exists, it overwrites the unused alpha bits via
   * the bandMapping passed to the shader (which reads RE from a uniform).
   *
   * Packing: [R, G, B, NIR] in RGBA. Red-Edge (band 4) is stored separately
   * via a second texture in a future enhancement; for now we pack it into alpha
   * and let the shader read it if band count >= 5.
   */
  private rastersToRGBA(rasters: any, size: number): Uint8ClampedArray {
    const rgba = new Uint8ClampedArray(size * size * 4);
    const bands = Array.isArray(rasters) ? rasters : [rasters];

    const r = bands[0];
    const g = bands[1] || bands[0];
    const b = bands[2] || bands[0];
    // If 5+ bands: store NIR in A and Red-Edge separately (we pack NDRE in alpha when RE exists)
    const nir = bands[3] || bands[0];

    // Detect max value for normalization (uint16 COGs are common)
    const maxVal = this.image?.getBitsPerSample() === 16 ? 65535 : 255;
    const scale = 255 / maxVal;

    for (let i = 0; i < size * size; i++) {
      rgba[i * 4]     = Math.round((r[i] ?? 0) * scale);
      rgba[i * 4 + 1] = Math.round((g[i] ?? 0) * scale);
      rgba[i * 4 + 2] = Math.round((b[i] ?? 0) * scale);
      rgba[i * 4 + 3] = Math.round((nir[i] ?? 0) * scale); // NIR in alpha
    }

    return rgba;
  }

  /** Returns the number of bands this COG has (set after init()) */
  getBandCount(): number {
    return this.bandCount;
  }
}
