import React, { useEffect, useMemo, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import { MapboxOverlay } from '@deck.gl/mapbox';
import { TileLayer } from '@deck.gl/geo-layers';
import { BitmapLayer } from '@deck.gl/layers';
import { VegetationIndexLayer } from './VegetationIndexLayer';
import { COGLoader } from '../lib/cog-loader';
import { VEGETATION_INDEX_CONFIG, VegetationIndex } from '../lib/vegetation-indices';

interface MapAnalyticsEngineProps {
  map: mapboxgl.Map | null;
  isEnabled: boolean;
  mode: 'RGB' | 'Multispectral' | 'None';
  tileUrl: string | null;
  /** WGS84 bounds [west, south, east, north] of the active RGB tileset — used for histogram */
  tileBounds?: [number, number, number, number];
  tileMinZoom?: number;
  selectedIndex: VegetationIndex;
  range: [number, number];
  bandMapping: { r: number, g: number, b: number, nir: number, re: number };
  onHistogramData?: (data: Array<{ value: number; count: number }>) => void;
  onDataRange?: (range: [number, number]) => void;
}

// Keep a persistent loader reference to avoid re-init on every render
const cogLoaders: Record<string, COGLoader> = {};

// Cache the full image data to avoid re-reading from R2 on every prop change
interface CachedCOGImage {
  imageData: ImageData;
  bounds: [number, number, number, number];
}
const cogImageCache: Record<string, CachedCOGImage> = {};

// ─── Tile math helpers for RGB histogram ──────────────────────────────────────

function lonToTileX(lon: number, z: number): number {
  return Math.floor((lon + 180) / 360 * Math.pow(2, z));
}

function latToTileY(lat: number, z: number): number {
  const r = lat * Math.PI / 180;
  return Math.floor((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * Math.pow(2, z));
}

// Pick the highest zoom where the bounding box needs ≤ maxTiles tiles.
function pickHistogramZoom(bounds: [number, number, number, number], minZoom: number, maxTiles = 25): number {
  const [west, south, east, north] = bounds;
  for (let z = Math.max(minZoom, 12); z <= 19; z++) {
    const cols = lonToTileX(east, z) - lonToTileX(west, z) + 1;
    const rows = latToTileY(south, z) - latToTileY(north, z) + 1;
    if (cols * rows > maxTiles) return Math.max(z - 1, Math.max(minZoom, 12));
  }
  return 19;
}

function loadTileImageData(url: string): Promise<ImageData | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth || 256;
        canvas.height = img.naturalHeight || 256;
        const ctx = canvas.getContext('2d');
        if (!ctx) { resolve(null); return; }
        ctx.drawImage(img, 0, 0);
        resolve(ctx.getImageData(0, 0, canvas.width, canvas.height));
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

async function computeRGBHistogram(
  tileUrlTemplate: string,
  bounds: [number, number, number, number],
  minZoom: number,
  calculate: (r: number, g: number, b: number, n: number, e: number) => number,
  domain: [number, number]
): Promise<{ histData: Array<{ value: number; count: number }>; dataRange: [number, number] }> {
  const z = pickHistogramZoom(bounds, minZoom);
  const [west, south, east, north] = bounds;
  const x0 = lonToTileX(west, z);
  const x1 = lonToTileX(east, z);
  const y0 = latToTileY(north, z); // y increases southward
  const y1 = latToTileY(south, z);

  const tilePromises: Promise<ImageData | null>[] = [];
  for (let x = x0; x <= x1; x++) {
    for (let y = y0; y <= y1; y++) {
      const url = tileUrlTemplate
        .replace('{z}', String(z))
        .replace('{x}', String(x))
        .replace('{y}', String(y));
      tilePromises.push(loadTileImageData(url));
    }
  }

  const tiles = await Promise.all(tilePromises);
  const values: number[] = [];

  for (const imgData of tiles) {
    if (!imgData) continue;
    const d = imgData.data;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] < 10) continue; // skip transparent/nodata pixels
      const r = d[i]     / 255;
      const g = d[i + 1] / 255;
      const b = d[i + 2] / 255;
      const val = calculate(r, g, b, 0, 0);
      if (isFinite(val) && !isNaN(val)) values.push(val);
    }
  }

  if (values.length === 0) {
    return { histData: [], dataRange: domain };
  }

  values.sort((a, b) => a - b);
  const minVal = values[Math.floor(values.length * 0.01)];
  const maxVal = values[Math.floor(values.length * 0.99)];
  const rangeSize = maxVal > minVal ? maxVal - minVal : 0.01;

  const buckets = 50;
  const counts = new Array(buckets).fill(0);
  for (const v of values) {
    if (v < minVal || v > maxVal) continue;
    let idx = Math.floor(((v - minVal) / rangeSize) * buckets);
    if (idx >= buckets) idx = buckets - 1;
    counts[idx]++;
  }

  const histData = counts.map((count, i) => ({
    value: minVal + (i / (buckets - 1)) * rangeSize,
    count,
  }));

  return { histData, dataRange: [minVal, maxVal] };
}

export function MapAnalyticsEngine({
  map,
  isEnabled,
  mode,
  tileUrl,
  tileBounds,
  tileMinZoom = 14,
  selectedIndex,
  range,
  bandMapping,
  onHistogramData,
  onDataRange
}: MapAnalyticsEngineProps) {
  const [overlay, setOverlay] = useState<MapboxOverlay | null>(null);

  // Track if we've loaded COG image data for the current URL
  const [cogImageData, setCogImageData] = useState<CachedCOGImage | null>(null);
  const loadingRef = useRef<string | null>(null);

  // Get active shader config
  const config = useMemo(() => VEGETATION_INDEX_CONFIG[selectedIndex], [selectedIndex]);

  // ─── Multispectral histogram — computed from loaded COG pixel data ──────────
  useEffect(() => {
    if (mode !== 'Multispectral' || !isEnabled || !onHistogramData) return;

    if (!cogImageData) {
      onHistogramData([]);
      return;
    }

    const dataArray = cogImageData.imageData.data;
    const { calculate } = config;

    // COGLoader packs: R=band0(Red), G=band1(Green), B=band2(NIR), A=band3(RedEdge)
    // bandMapping indices directly address texture channels 0=R,1=G,2=B,3=A
    const getChannel = (idx: number, pixels: Uint8ClampedArray, offset: number): number => {
      if (idx === 0) return pixels[offset]     / 255;
      if (idx === 1) return pixels[offset + 1] / 255;
      if (idx === 2) return pixels[offset + 2] / 255;
      return pixels[offset + 3] / 255;
    };

    const values: number[] = [];
    for (let i = 0; i < dataArray.length; i += 4) {
      // The VegetationIndexLayer shader uses `total > 0.0001` for nodata detection.
      // Mirror that here: skip pixels where all spectral channels are zero.
      const total = dataArray[i] + dataArray[i + 1] + dataArray[i + 2] + dataArray[i + 3];
      if (total === 0) continue;

      const r = getChannel(bandMapping.r,   dataArray, i);
      const g = getChannel(bandMapping.g,   dataArray, i);
      const b = getChannel(bandMapping.b,   dataArray, i);
      const n = getChannel(bandMapping.nir, dataArray, i);
      const e = getChannel(bandMapping.re,  dataArray, i);
      const val = calculate(r, g, b, n, e);
      if (isFinite(val) && !isNaN(val)) values.push(val);
    }

    if (values.length === 0) { onHistogramData([]); return; }

    values.sort((a, b) => a - b);
    const minVal = values[Math.floor(values.length * 0.01)];
    const maxVal = values[Math.floor(values.length * 0.99)];
    const safeMax = maxVal > minVal ? maxVal : minVal + 0.01;

    if (onDataRange) onDataRange([minVal, safeMax]);

    const buckets = 50;
    const counts = new Array(buckets).fill(0);
    const rangeSize = safeMax - minVal;
    for (const v of values) {
      if (v < minVal || v > safeMax) continue;
      let idx = Math.floor(((v - minVal) / rangeSize) * buckets);
      if (idx >= buckets) idx = buckets - 1;
      counts[idx]++;
    }

    onHistogramData(counts.map((count, i) => ({
      value: minVal + (i / (buckets - 1)) * rangeSize,
      count,
    })));
  }, [isEnabled, mode, cogImageData, config, bandMapping, onHistogramData, onDataRange]);

  // ─── RGB histogram — fetch actual tiles, compute real index values ──────────
  const rgbHistLoadingRef = useRef<string | null>(null);

  useEffect(() => {
    if (mode !== 'RGB' || !isEnabled || !onHistogramData || !tileUrl || !tileBounds) return;

    // Key that identifies this exact histogram request
    const key = `${tileUrl}|${selectedIndex}`;
    if (rgbHistLoadingRef.current === key) return;
    rgbHistLoadingRef.current = key;

    onHistogramData([]); // clear while loading

    computeRGBHistogram(tileUrl, tileBounds, tileMinZoom, config.calculate, config.domain)
      .then(({ histData, dataRange }) => {
        if (rgbHistLoadingRef.current !== key) return; // stale
        if (histData.length > 0) {
          if (onDataRange) onDataRange(dataRange);
          onHistogramData(histData);
        }
        rgbHistLoadingRef.current = null;
      })
      .catch(() => {
        rgbHistLoadingRef.current = null;
        onHistogramData([]);
      });
  }, [isEnabled, mode, tileUrl, tileBounds, tileMinZoom, selectedIndex, config, onHistogramData, onDataRange]);

  // ─── Load COG full image when URL changes ──────────────────────────────────
  useEffect(() => {
    if (mode !== 'Multispectral' || !tileUrl || !isEnabled) {
      setCogImageData(null);
      return;
    }

    // Already cached
    if (cogImageCache[tileUrl]) {
      setCogImageData(cogImageCache[tileUrl]);
      return;
    }

    // Already loading
    if (loadingRef.current === tileUrl) return;
    loadingRef.current = tileUrl;

    const loadFullImage = async () => {
      try {
        if (!cogLoaders[tileUrl]) {
          cogLoaders[tileUrl] = new COGLoader(tileUrl);
        }
        console.log('[MapAnalyticsEngine] Loading full COG image...');
        const result = await cogLoaders[tileUrl].getFullImage(2048);
        console.log('[MapAnalyticsEngine] getFullImage returned:', result ? `${result.imageData.width}×${result.imageData.height}` : 'null');
        if (result) {
          console.log('[MapAnalyticsEngine] ✅ Setting COG image data, bounds:', result.bounds);
          cogImageCache[tileUrl] = result;
          setCogImageData(result);
        } else {
          console.error('[MapAnalyticsEngine] ❌ getFullImage returned null!');
        }
      } catch (e) {
        console.error('[MapAnalyticsEngine] ❌ Failed to load COG full image:', e);
      } finally {
        loadingRef.current = null;
      }
    };

    loadFullImage();
  }, [mode, tileUrl, isEnabled]);

  // ─── Overlay initialization ─────────────────────────────────────────────────
  useEffect(() => {
    if (!map || !map.isStyleLoaded()) return;
    if (overlay) return; // already created

    const newOverlay = new MapboxOverlay({ interleaved: true, layers: [] });
    map.addControl(newOverlay as unknown as mapboxgl.IControl);
    setOverlay(newOverlay);
  }, [map, overlay]);

  // ─── Layer construction ────────────────────────────────────────────────────
  useEffect(() => {
    if (!overlay) return;

    if (!map || !map.isStyleLoaded() || !isEnabled || !tileUrl || mode === 'None') {
      overlay.setProps({ layers: [] });
      return;
    }

    // Stable key that changes when shader needs to recompile
    const shaderKey = `${selectedIndex}-${range[0].toFixed(3)}-${range[1].toFixed(3)}-${bandMapping.r}${bandMapping.g}${bandMapping.b}${bandMapping.nir}${bandMapping.re}`;

    let layers: any[] = [];

    if (mode === 'RGB') {
      // RGB tiles served by tile-proxy — use standard TileLayer
      layers = [
        new TileLayer({
          id: `deck-analysis-rgb-${shaderKey}`,
          data: tileUrl,
          minZoom: 0,
          maxZoom: 22,
          tileSize: 256,
          renderSubLayers: (props: any) => {
            const { boundingBox } = props.tile;
            return new VegetationIndexLayer(props, {
              data: null,
              image: props.data,
              shaderMath: config.shaderMath,
              range: range,
              bandMapping: bandMapping,
              bounds: [
                boundingBox[0][0], boundingBox[0][1],
                boundingBox[1][0], boundingBox[1][1]
              ],
            });
          }
        })
      ];
    } else if (mode === 'Multispectral' && cogImageData) {
      // Multispectral COG — render the whole image as a single BitmapLayer
      // The VegetationIndexLayer extends BitmapLayer and applies the index shader.
      // bounds: [west, south, east, north] in WGS84
      const { imageData, bounds } = cogImageData;
      console.log(`[MapAnalyticsEngine] Rendering COG BitmapLayer. bounds=${JSON.stringify(bounds)} size=${imageData.width}×${imageData.height}`);

      layers = [
        new VegetationIndexLayer({
          id: `deck-analysis-cog-${shaderKey}`,
          image: imageData,
          bounds: [bounds[0], bounds[1], bounds[2], bounds[3]] as [number, number, number, number],
          shaderMath: config.shaderMath,
          range: range,
          bandMapping: bandMapping,
          opacity: 1,
          pickable: false,
        })
      ];
    } else if (mode === 'Multispectral' && !cogImageData) {
      // Still loading — keep existing layers to avoid flicker
      return;
    }

    overlay.setProps({ layers });

  }, [map, isEnabled, mode, tileUrl, selectedIndex, range, bandMapping, overlay, config, cogImageData]);

  // ─── Auto-Fly Logic ────────────────────────────────────────────────────────
  // When COG image is loaded, fly the map to its bounds.
  const [hasFlownTo, setHasFlownTo] = useState<string | null>(null);

  useEffect(() => {
    if (mode !== 'Multispectral' || !tileUrl || !map || hasFlownTo === tileUrl) return;
    if (!cogImageData) return;

    const bounds = cogImageData.bounds;
    if (bounds && !isNaN(bounds[0]) && !isNaN(bounds[1]) && !isNaN(bounds[2]) && !isNaN(bounds[3])) {
      console.log('[MapAnalyticsEngine] Auto-flying to COG bounds:', bounds);
      try {
        map.fitBounds(
          [[bounds[0], bounds[1]], [bounds[2], bounds[3]]],
          { padding: 80, duration: 2000, maxZoom: 21 }
        );
        setHasFlownTo(tileUrl);
      } catch (e) {
        console.warn('[MapAnalyticsEngine] fitBounds error:', e);
      }
    } else {
      console.warn('[MapAnalyticsEngine] Invalid bounds for autofly:', bounds);
    }
  }, [mode, tileUrl, map, hasFlownTo, cogImageData]);

  // Reset fly-to state when layer is deselected
  useEffect(() => {
    if (mode === 'None') {
      setHasFlownTo(null);
      setCogImageData(null);
    }
  }, [mode]);

  // ─── Cleanup ────────────────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      if (overlay && map) {
        try { map.removeControl(overlay as unknown as mapboxgl.IControl); } catch (_) { /* noop */ }
      }
    };
  }, [overlay, map]);

  return null;
}
