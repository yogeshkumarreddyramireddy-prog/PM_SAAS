import { booleanPointInPolygon, point } from '@turf/turf';
import type { Polygon, MultiPolygon } from 'geojson';

export type MetricKey = 'min' | 'max' | 'mean' | 'median' | 'stdDev' | 'variance' | 'count' | 'sum';

export const ALL_METRICS: MetricKey[] = ['min', 'max', 'mean', 'median', 'stdDev', 'variance', 'count', 'sum'];

export const METRIC_LABELS: Record<MetricKey, string> = {
  min: 'Min',
  max: 'Max',
  mean: 'Mean',
  median: 'Median',
  stdDev: 'Std Dev',
  variance: 'Variance',
  count: 'Pixel Count',
  sum: 'Sum',
};

export interface ZonalResult {
  min: number;
  max: number;
  mean: number;
  median: number;
  stdDev: number;
  variance: number;
  count: number;
  sum: number;
}

export interface RawWindowData {
  bands: (Float32Array | Float64Array | Uint16Array | Uint8Array | Int16Array | Int32Array)[];
  width: number;
  height: number;
  // Top-left corner of the window in native CRS
  originNativeX: number;
  originNativeY: number;
  // Absolute pixel size in native CRS units (always positive)
  pixelWidthNative: number;
  pixelHeightNative: number;
  isFloat32: boolean;
  is16Bit: boolean;
}

export interface BandMapping {
  r: number;
  g: number;
  b: number;
  nir: number;
  re: number;
}

/**
 * Compute zonal statistics for a single polygon zone against a pre-read raw window.
 *
 * The polygon must be expressed in the same CRS as the window origin coords.
 * Call this once per (annotation × layer × index) combination — or more efficiently,
 * once per (annotation × layer) and loop over indices on the same valid-pixel set.
 */
export function computeZonalStats(
  windowData: RawWindowData,
  polygonNativeCRS: Polygon | MultiPolygon,
  bandMapping: BandMapping,
  indexFn: (r: number, g: number, b: number, n: number, e: number) => number,
  metrics: Set<MetricKey>
): ZonalResult | null {
  const {
    bands,
    width,
    height,
    originNativeX,
    originNativeY,
    pixelWidthNative,
    pixelHeightNative,
    isFloat32,
    is16Bit,
  } = windowData;

  // Normalize raw sensor values to 0–1 range so index formulas work correctly
  const scale = isFloat32 ? 1 : is16Bit ? 1 / 65535 : 1 / 255;

  const safeVal = (
    band: (Float32Array | Float64Array | Uint16Array | Uint8Array | Int16Array | Int32Array) | undefined,
    idx: number
  ): number => (band ? (band[idx] ?? 0) * scale : 0);

  const bandR = bands[bandMapping.r];
  const bandG = bands[bandMapping.g];
  const bandB = bands[bandMapping.b];
  const bandN = bands[bandMapping.nir];
  const bandE = bands[bandMapping.re];

  const validValues: number[] = [];

  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      const idx = row * width + col;

      // Pixel center in native CRS (Y decreases downward in image space)
      const px = originNativeX + (col + 0.5) * pixelWidthNative;
      const py = originNativeY - (row + 0.5) * pixelHeightNative;

      const pt = point([px, py]);
      if (!booleanPointInPolygon(pt, polygonNativeCRS as any)) continue;

      const r = safeVal(bandR, idx);
      const g = safeVal(bandG, idx);
      const b = safeVal(bandB, idx);
      const n = safeVal(bandN, idx);
      const e = safeVal(bandE, idx);

      // Skip nodata (all bands zero)
      if (r === 0 && g === 0 && b === 0 && n === 0 && e === 0) continue;

      const value = indexFn(r, g, b, n, e);
      if (!isFinite(value)) continue;

      validValues.push(value);
    }
  }

  if (validValues.length === 0) return null;

  const count = validValues.length;
  let sum = 0;
  let min = Infinity;
  let max = -Infinity;

  for (const v of validValues) {
    sum += v;
    if (v < min) min = v;
    if (v > max) max = v;
  }

  const mean = sum / count;

  let variance = 0;
  for (const v of validValues) variance += (v - mean) ** 2;
  variance /= count;
  const stdDev = Math.sqrt(variance);

  validValues.sort((a, b) => a - b);
  const mid = Math.floor(count / 2);
  const median = count % 2 === 0 ? (validValues[mid - 1] + validValues[mid]) / 2 : validValues[mid];

  return { min, max, mean, median, stdDev, variance, count, sum };
}

/**
 * Reproject a GeoJSON polygon from WGS84 to native CRS using the provided project function.
 * Returns a new polygon with coordinates in native CRS — safe to pass to computeZonalStats.
 */
export function reprojectPolygon(
  geom: Polygon | MultiPolygon,
  project: (lon: number, lat: number) => [number, number]
): Polygon | MultiPolygon {
  if (geom.type === 'Polygon') {
    return {
      type: 'Polygon',
      coordinates: geom.coordinates.map(ring =>
        ring.map(([lon, lat]) => project(lon, lat) as [number, number])
      ),
    };
  }
  return {
    type: 'MultiPolygon',
    coordinates: geom.coordinates.map(poly =>
      poly.map(ring =>
        ring.map(([lon, lat]) => project(lon, lat) as [number, number])
      )
    ),
  };
}

/**
 * Round a number to a given number of decimal places.
 * Used for clean Excel output.
 */
export function roundTo(n: number, decimals = 6): number {
  const factor = 10 ** decimals;
  return Math.round(n * factor) / factor;
}
