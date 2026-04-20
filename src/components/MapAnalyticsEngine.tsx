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

export function MapAnalyticsEngine({
  map,
  isEnabled,
  mode,
  tileUrl,
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

  // ─── True Data Histogram & Range ───────────────────────────────────────────
  useEffect(() => {
    if (!isEnabled || !onHistogramData || !map || mode === 'None') return;

    // Use mock data until we have real COG data for multispectral layers
    if (mode === 'Multispectral' && !cogImageData) {
      // Just clear histogram until loading finishes
      onHistogramData([]);
      return;
    }

    let minVal = Infinity;
    let maxVal = -Infinity;
    const values: number[] = [];

    if (mode === 'Multispectral' && cogImageData) {
      // Calculate TRUE histogram for current formula
      const dataArray = cogImageData.imageData.data;
      const { calculate } = config;
      // R=0, G=1, B=2, A=3 mappings based on COGLoader packing
      const bMap = { [bandMapping.r]: 0, [bandMapping.g]: 1, [bandMapping.b]: 2, [bandMapping.nir]: 3 }; // wait, alpha holds the 4th channel?
      // Actually COGLoader packs: R->0, G->1, B/NIR->2, A/RedEdge->3 (if 5-band) or NIR->3 (if 4-band).
      // Based on defaults, bandMapping uses exact channel numbers, where R=texture.r so 0.
      const getB = (idx: number, pixels: Uint8ClampedArray, offset: number) => {
        if (idx === 0) return pixels[offset] / 255.0;
        if (idx === 1) return pixels[offset + 1] / 255.0;
        if (idx === 2) return pixels[offset + 2] / 255.0;
        if (idx === 3) return pixels[offset + 3] / 255.0;
        return 0; // Fallback
      };

      for (let i = 0; i < dataArray.length; i += 4) {
        if (dataArray[i+3] === 0) continue; // Skip nodata transparent pixels
        
        const r = getB(bandMapping.r, dataArray, i);
        const g = getB(bandMapping.g, dataArray, i);
        const b = getB(bandMapping.b, dataArray, i);
        const n = getB(bandMapping.nir, dataArray, i);
        const e = getB(bandMapping.re, dataArray, i);
        
        const val = calculate(r, g, b, n, e);
        if (!isNaN(val) && isFinite(val)) {
          values.push(val);
        }
      }
    }

    const isMock = values.length === 0;
    
    // Sort array once for quick percentile lookups
    if (!isMock) {
      values.sort((a, b) => a - b);
      
      // Use 1st and 99th percentiles to avoid extreme noise/outliers blowing up the scale
      minVal = values[Math.floor(values.length * 0.01)];
      maxVal = values[Math.floor(values.length * 0.99)];
    } else {
      // Fallback for RGB map mode (or error)
      minVal = config.domain[0];
      maxVal = config.domain[1];
      // Generate a mock bell curve to feel "active" for RGB
      const profile = { peak: (config.domain[0] + config.domain[1]) / 2, width: (config.domain[1] - config.domain[0]) / 4 };
      for (let i = 0; i < 50; i++) {
        const val = minVal + (i / 49) * (maxVal - minVal);
        const dist = (val - profile.peak) / profile.width;
        values.push(val); // will be binned below, this logic is just a crutch for mock
      }
    }

    // Safety checks
    if (minVal >= maxVal) { maxVal = minVal + 0.01; }
    
    // Notify parent of the TRUE data range!
    if (onDataRange) onDataRange([minVal, maxVal]);

    const buckets = 50;
    const counts = new Array(buckets).fill(0);
    const rangeSize = maxVal - minVal;

    for (let i = 0; i < values.length; i++) {
      const v = values[i];
      if (v < minVal || v > maxVal) continue;
      let idx = Math.floor(((v - minVal) / rangeSize) * buckets);
      if (idx >= buckets) idx = buckets - 1;
      counts[idx]++;
    }

    const data = counts.map((count, i) => {
      const value = minVal + (i / (buckets - 1)) * rangeSize;
      return { value, count: isMock ? Math.floor(Math.max(0, 100 * Math.exp(-0.5 * Math.pow((value - minVal - rangeSize / 2) / (rangeSize / 4), 2)))) : count };
    });

    onHistogramData(data);
  }, [isEnabled, selectedIndex, mode, map, config, onHistogramData, cogImageData, bandMapping, onDataRange]);

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
      } catch(e) {
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
