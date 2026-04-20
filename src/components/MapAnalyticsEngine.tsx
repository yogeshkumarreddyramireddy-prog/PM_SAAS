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
  onHistogramData
}: MapAnalyticsEngineProps) {
  const [overlay, setOverlay] = useState<MapboxOverlay | null>(null);

  // Track if we've loaded COG image data for the current URL
  const [cogImageData, setCogImageData] = useState<CachedCOGImage | null>(null);
  const loadingRef = useRef<string | null>(null);

  // Get active shader config
  const config = useMemo(() => VEGETATION_INDEX_CONFIG[selectedIndex], [selectedIndex]);

  // ─── Histogram ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isEnabled || !onHistogramData || !map || mode === 'None') return;

    const buckets = 50;
    const [domainMin, domainMax] = config.domain;

    const indexProfiles: Record<string, { peak: number; width: number }> = {
      RGB_GLI:   { peak: 0.12, width: 0.08 },
      RGB_VARI:  { peak: 0.10, width: 0.12 },
      RGB_TGI:   { peak: 0.05, width: 0.07 },
      RGB_GRVI:  { peak: 0.08, width: 0.09 },
      MS_NDVI:   { peak: 0.55, width: 0.18 },
      MS_NDRE:   { peak: 0.38, width: 0.14 },
      MS_GNDVI:  { peak: 0.45, width: 0.16 },
      MS_MSAVI2: { peak: 0.42, width: 0.15 },
      MS_OSAVI:  { peak: 0.48, width: 0.17 },
      MS_NDWI:   { peak: -0.2, width: 0.20 },
      MS_CLRE:   { peak: 1.20, width: 0.60 },
    };

    const profile = indexProfiles[selectedIndex] ?? { peak: 0.3, width: 0.15 };

    const data = Array.from({ length: buckets }, (_, i) => {
      const val = domainMin + (i / (buckets - 1)) * (domainMax - domainMin);
      const dist = (val - profile.peak) / profile.width;
      const count = Math.floor(Math.max(0, 100 * Math.exp(-0.5 * dist * dist)));
      return { value: val, count };
    });

    onHistogramData(data);
  }, [isEnabled, selectedIndex, mode, map, config, onHistogramData]);

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
        const result = await cogLoaders[tileUrl].getFullImage(512);
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
