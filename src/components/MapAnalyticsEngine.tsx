import React, { useEffect, useMemo, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import { MapboxOverlay } from '@deck.gl/mapbox';
import { TileLayer } from '@deck.gl/geo-layers';
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

  // Get active shader config
  const config = useMemo(() => VEGETATION_INDEX_CONFIG[selectedIndex], [selectedIndex]);

  // ─── Histogram ─────────────────────────────────────────────────────────────
  // Generates a simulated distribution per index type.
  // Each index has a different typical distribution shape.
  useEffect(() => {
    if (!isEnabled || !onHistogramData || !map || mode === 'None') return;

    const buckets = 50;
    const [domainMin, domainMax] = config.domain;

    // Different health profiles per index category/formula
    // This varies meaningfully per index while we await real pixel readback
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

  // ─── Layer construction ────────────────────────────────────────────────────
  // We include range + bandMapping in the layer ID so Deck.GL fully tears down
  // and rebuilds the layer (recompiling the shader) whenever these change.
  useEffect(() => {
    if (!map || !map.isStyleLoaded() || !isEnabled || !tileUrl || mode === 'None') {
      if (overlay) overlay.setProps({ layers: [] });
      return;
    }

    // Create the overlay once and keep it alive
    if (!overlay) {
      const newOverlay = new MapboxOverlay({ interleaved: true, layers: [] });
      map.addControl(newOverlay as unknown as mapboxgl.IControl);
      setOverlay(newOverlay);
      return; // state update will re-trigger this effect
    }

    // Stable key that changes when shader needs to recompile
    const shaderKey = `${selectedIndex}-${range[0].toFixed(3)}-${range[1].toFixed(3)}-${bandMapping.r}${bandMapping.g}${bandMapping.b}${bandMapping.nir}${bandMapping.re}`;

    let layers: any[] = [];

    if (mode === 'RGB') {
      layers = [
        new TileLayer({
          id: `deck-analysis-rgb-${shaderKey}`,
          data: tileUrl,
          minZoom: 0,
          maxZoom: 22,
          tileSize: 256,
          renderSubLayers: (props) => {
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
    } else if (mode === 'Multispectral') {
      // Reuse loader for the same URL; create a new one if URL changes
      if (!cogLoaders[tileUrl]) {
        cogLoaders[tileUrl] = new COGLoader(tileUrl);
      }

      layers = [
        new TileLayer({
          id: `deck-analysis-cog-${shaderKey}`,
          data: tileUrl,
          minZoom: 0,
          maxZoom: 22,
          tileSize: 256,
          getTileData: ({ x, y, z }: { x: number; y: number; z: number }) =>
            cogLoaders[tileUrl].getTile(x, y, z),
          renderSubLayers: (props) => {
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
    }

    overlay.setProps({ layers });

  }, [map, isEnabled, mode, tileUrl, selectedIndex, range, bandMapping, overlay, config]);

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
