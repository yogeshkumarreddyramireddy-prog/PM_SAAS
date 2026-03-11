import { useEffect, useRef } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { VectorLayer } from '@/types/vectorLayer';

interface VectorLayerMapProps {
  map: mapboxgl.Map | null;
  layers: VectorLayer[];
  activeLayers: string[];
  onLayerClick?: (layerId: string, feature: any) => void;
}

export function VectorLayerMap({ map, layers, activeLayers, onLayerClick }: VectorLayerMapProps) {
  const layerRefs = useRef<Record<string, boolean>>({});

  // Add or update vector layers
  useEffect(() => {
    if (!map) return;

    // Process each layer
    layers.forEach((layer) => {
      const layerId = `vector-layer-${layer.id}`;
      const sourceId = `vector-source-${layer.id}`;
      const isActive = activeLayers.includes(layer.id);

      // Skip if layer is not active or already added
      if (!isActive) {
        if (layerRefs.current[layer.id]) {
          // Remove layer if it exists but is not active
          if (map.getLayer(layerId)) {
            map.removeLayer(layerId);
          }
          if (map.getSource(sourceId)) {
            map.removeSource(sourceId);
          }
          delete layerRefs.current[layer.id];
        }
        return;
      }

      // Skip if layer is already added
      if (layerRefs.current[layer.id]) return;

      try {
        // Add source
        map.addSource(sourceId, {
          type: 'geojson',
          data: {
            type: 'FeatureCollection',
            features: layer.geojson.features,
          },
        });

        // Add layer based on geometry type
        const geometryType = layer.geojson.features[0]?.geometry.type;
        if (!geometryType) return;

        const paint: any = {
          'fill-color': layer.style?.fillColor || '#3F51B5',
          'fill-opacity': layer.style?.fillOpacity ?? 0.5,
          'line-color': layer.style?.strokeColor || '#1A237E',
          'line-width': layer.style?.strokeWidth ?? 2,
          'line-opacity': layer.style?.strokeOpacity ?? 1,
        };

        switch (geometryType) {
          case 'Polygon':
          case 'MultiPolygon':
            map.addLayer({
              id: layerId,
              type: 'fill',
              source: sourceId,
              layout: {},
              paint: {
                ...paint,
                'fill-color': layer.style?.fillColor || '#3F51B5',
              },
            });
            break;

          case 'LineString':
          case 'MultiLineString':
            map.addLayer({
              id: layerId,
              type: 'line',
              source: sourceId,
              layout: {
                'line-join': 'round',
                'line-cap': 'round',
              },
              paint: {
                ...paint,
                'line-color': layer.style?.strokeColor || '#1A237E',
              },
            });
            break;

          case 'Point':
          case 'MultiPoint':
            map.addLayer({
              id: layerId,
              type: 'circle',
              source: sourceId,
              paint: {
                'circle-radius': layer.style?.pointRadius ?? 5,
                'circle-color': layer.style?.pointColor || '#FF4081',
                'circle-opacity': layer.style?.pointOpacity ?? 0.8,
                'circle-stroke-width': 1,
                'circle-stroke-color': '#fff',
              },
            });
            break;
        }

        // Add click handler
        if (onLayerClick) {
          map.on('click', layerId, (e) => {
            if (e.features && e.features.length > 0) {
              onLayerClick(layer.id, e.features[0]);
            }
          });

          // Change cursor on hover
          map.on('mouseenter', layerId, () => {
            map.getCanvas().style.cursor = 'pointer';
          });

          map.on('mouseleave', layerId, () => {
            map.getCanvas().style.cursor = '';
          });
        }

        layerRefs.current[layer.id] = true;
      } catch (error) {
        console.error(`Error adding layer ${layer.id}:`, error);
      }
    });

    // Cleanup function
    return () => {
      if (!map) return;

      layers.forEach((layer) => {
        const layerId = `vector-layer-${layer.id}`;
        const sourceId = `vector-source-${layer.id}`;

        if (map.getLayer(layerId)) {
          map.removeLayer(layerId);
        }
        if (map.getSource(sourceId)) {
          map.removeSource(sourceId);
        }
      });
    };
  }, [map, layers, activeLayers, onLayerClick]);

  return null;
}

export default VectorLayerMap;
