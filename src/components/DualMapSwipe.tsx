import { useEffect, useRef, useState, useCallback } from 'react';
import mapboxgl from 'mapbox-gl';
import { Button } from '@/components/ui/button';
import { MoveHorizontal, X } from 'lucide-react';
import { applySwipeVisibility } from '@/lib/mapSwipeVisibility';

interface LayerMetadata {
  name: string;
  date: string; // Formatted date string
  type: 'health' | 'raster' | 'vector';
}

interface DualMapSwipeProps {
  map: mapboxgl.Map | null;
  leftLayerId: string | null;  // Layer to show ONLY on left map
  rightLayerId: string | null; // Layer to show ONLY on right map
  enabled: boolean;
  onToggle: () => void;
  mapboxAccessToken: string;
  leftLayerMeta?: LayerMetadata;
  rightLayerMeta?: LayerMetadata;
}

/**
 * Dual Map Swipe - Creates a second map when enabled for true layer comparison
 * Only active when swipe mode is enabled
 */
export const DualMapSwipe = ({ 
  map, 
  leftLayerId, 
  rightLayerId,
  enabled, 
  onToggle,
  mapboxAccessToken,
  leftLayerMeta,
  rightLayerMeta
}: DualMapSwipeProps) => {
  const [sliderPosition, setSliderPosition] = useState(50);
  const [isDragging, setIsDragging] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const rightMapRef = useRef<mapboxgl.Map | null>(null);
  const rightMapContainerRef = useRef<HTMLDivElement>(null);
  const rafIdRef = useRef<number | null>(null);
  const syncingRef = useRef(false);
  const isCreatingMapRef = useRef(false);

  // Initialize right map when swipe is enabled
  useEffect(() => {
    if (!enabled || !map || !rightMapContainerRef.current) {
      // Cleanup right map if disabled
      if (rightMapRef.current) {
        console.log('🧹 Cleaning up right map');
        rightMapRef.current.remove();
        rightMapRef.current = null;
      }
      return;
    }

    // Don't create if already exists or being created
    if (rightMapRef.current || isCreatingMapRef.current) {
      console.log('⏭️ Right map already exists or being created, skipping');
      return;
    }

    isCreatingMapRef.current = true;
    console.log('🗺️ Creating second map for swipe comparison');

    // Get a deep copy of the style to avoid sharing references
    const currentStyle = map.getStyle();
    const styleCopy = JSON.parse(JSON.stringify(currentStyle));
    
    // Copy GeoJSON sources properly (they don't serialize well)
    if (currentStyle.sources) {
      Object.keys(currentStyle.sources).forEach(sourceId => {
        const source = map.getSource(sourceId);
        if (source && (source as any).type === 'geojson') {
          const geojsonData = (source as any)._data;
          if (geojsonData && styleCopy.sources[sourceId]) {
            styleCopy.sources[sourceId].data = geojsonData;
          }
        }
      });
    }

    // Create right map with same settings as left
    const rightMap = new mapboxgl.Map({
      container: rightMapContainerRef.current,
      style: styleCopy,
      center: map.getCenter(),
      zoom: map.getZoom(),
      minZoom: map.getMinZoom(),
      maxZoom: map.getMaxZoom(),
      bearing: map.getBearing(),
      pitch: map.getPitch(),
      accessToken: mapboxAccessToken
    });

    rightMapRef.current = rightMap;
    isCreatingMapRef.current = false;

    rightMap.on('load', () => {
      console.log('✅ Right map loaded');

      // Wait for style to fully load before modifying layers, then apply the
      // shared swipe visibility rule (raster-only target, all vectors hidden).
      rightMap.once('idle', () => {
        applySwipeVisibility(rightMap, rightLayerId);
      });

      // Sync maps
      const syncMaps = (source: mapboxgl.Map, target: mapboxgl.Map) => {
        if (syncingRef.current) return;
        syncingRef.current = true;

        target.jumpTo({
          center: source.getCenter(),
          zoom: source.getZoom(),
          bearing: source.getBearing(),
          pitch: source.getPitch()
        });

        syncingRef.current = false;
      };

      // Left map controls right map
      const syncRight = () => syncMaps(map, rightMap);
      map.on('move', syncRight);
      map.on('zoom', syncRight);
      map.on('rotate', syncRight);
      map.on('pitch', syncRight);

      // Right map controls left map
      const syncLeft = () => syncMaps(rightMap, map);
      rightMap.on('move', syncLeft);
      rightMap.on('zoom', syncLeft);
      rightMap.on('rotate', syncLeft);
      rightMap.on('pitch', syncLeft);

      // Store cleanup functions
      (rightMap as any)._cleanupSync = () => {
        map.off('move', syncRight);
        map.off('zoom', syncRight);
        map.off('rotate', syncRight);
        map.off('pitch', syncRight);
        rightMap.off('move', syncLeft);
        rightMap.off('zoom', syncLeft);
        rightMap.off('rotate', syncLeft);
        rightMap.off('pitch', syncLeft);
      };
    });

    return () => {
      if (rightMapRef.current) {
        if ((rightMapRef.current as any)._cleanupSync) {
          (rightMapRef.current as any)._cleanupSync();
        }
        rightMapRef.current.remove();
        rightMapRef.current = null;
      }
    };
  // Only depend on enabled/map/token — DO NOT include layer IDs or the map will be recreated on every selection change
  }, [enabled, map, mapboxAccessToken]);

  // ── Re-apply right-map visibility whenever the right selection changes. ──
  useEffect(() => {
    if (!enabled || !rightMapRef.current) return;

    const rightMap = rightMapRef.current;
    applySwipeVisibility(rightMap, rightLayerId);

    // Catch layers that loaded late by running once more on the next idle.
    const onIdle = () => {
      applySwipeVisibility(rightMap, rightLayerId);
      rightMap.off('idle', onIdle);
    };
    rightMap.on('idle', onIdle);

    return () => {
      rightMap.off('idle', onIdle);
    };
  }, [enabled, rightLayerId]);

  // Synchronize layer changes from main map to right map
  useEffect(() => {
    if (!enabled || !map || !rightMapRef.current) return;

    const rightMap = rightMapRef.current;
    
    // Wait for right map to be ready
    if (!rightMap.loaded() || !rightMap.isStyleLoaded()) return;

    const syncLayers = () => {
      const mainStyle = map.getStyle();
      if (!mainStyle || !mainStyle.layers) return;

      const mainLayerIds = new Set(mainStyle.layers.map((l: any) => l.id));
      const rightStyle = rightMap.getStyle();
      if (!rightStyle || !rightStyle.layers) return;

      // 1. Remove layers from right map that don't exist in main map anymore.
      rightStyle.layers.forEach((layer: any) => {
        if ((layer.id.startsWith('tileset-layer-') ||
             layer.id.startsWith('health-map-layer-') ||
             layer.id.startsWith('vector-layer-')) &&
            !mainLayerIds.has(layer.id)) {
          try {
            const sourceId = layer.source;
            if (rightMap.getLayer(layer.id)) {
              rightMap.removeLayer(layer.id);
            }
            if (sourceId && rightMap.getSource(sourceId)) {
              const rightLayers = rightMap.getStyle()?.layers || [];
              const sourceInUse = rightLayers.some((l: any) => l.source === sourceId && l.id !== layer.id);
              if (!sourceInUse) {
                rightMap.removeSource(sourceId);
              }
            }
          } catch (e) {
            console.warn(`Could not remove layer ${layer.id}:`, e);
          }
        }
      });

      // 2. Add new layers from main map that aren't on right map yet. Visibility
      //    is normalized below by applySwipeVisibility — don't second-guess it here.
      mainStyle.layers.forEach((layer: any) => {
        if ((layer.id.startsWith('tileset-layer-') ||
             layer.id.startsWith('health-map-layer-') ||
             layer.id.startsWith('vector-layer-')) &&
            !rightMap.getLayer(layer.id)) {
          try {
            const sourceId = layer.source;
            if (!rightMap.getSource(sourceId)) {
              const mainSource = map.getSource(sourceId);
              if (mainSource) {
                if ((mainSource as any).type === 'geojson') {
                  const geojsonData = (mainSource as any)._data;
                  rightMap.addSource(sourceId, { type: 'geojson', data: geojsonData });
                } else {
                  const sourceData = (mainSource as any).serialize();
                  rightMap.addSource(sourceId, sourceData);
                }
              }
            }
            if (rightMap.getSource(sourceId)) {
              rightMap.addLayer(JSON.parse(JSON.stringify(layer)));
            }
          } catch (e) {
            console.warn(`Could not add layer ${layer.id} to right map:`, e);
          }
        }
      });

      // 3. Single source of truth for visibility on the right map.
      applySwipeVisibility(rightMap, rightLayerId);
    };

    // Sync immediately
    syncLayers();

    // Set up interval to keep syncing (in case of changes)
    const intervalId = setInterval(syncLayers, 500);

    return () => {
      clearInterval(intervalId);
    };
  }, [enabled, map, rightLayerId]);

  // Handle drag
  const handleDragStart = (clientX: number) => {
    if (!enabled) return;
    setIsDragging(true);
    updatePosition(clientX);
  };

  const handleDragMove = useCallback((clientX: number) => {
    if (!isDragging || !enabled) return;

    if (rafIdRef.current) {
      cancelAnimationFrame(rafIdRef.current);
    }

    rafIdRef.current = requestAnimationFrame(() => {
      updatePosition(clientX);
    });
  }, [isDragging, enabled]);

  const handleDragEnd = useCallback(() => {
    setIsDragging(false);
    if (rafIdRef.current) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }
  }, []);

  const updatePosition = (clientX: number) => {
    if (!containerRef.current) return;

    const rect = containerRef.current.getBoundingClientRect();
    const x = clientX - rect.left;
    const percentage = Math.max(0, Math.min(100, (x / rect.width) * 100));
    
    setSliderPosition(percentage);
  };

  // Mouse events
  const onMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    handleDragStart(e.clientX);
  };

  const onMouseMove = useCallback((e: MouseEvent) => {
    handleDragMove(e.clientX);
  }, [handleDragMove]);

  const onMouseUp = useCallback(() => {
    handleDragEnd();
  }, [handleDragEnd]);

  // Touch events
  const onTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length > 0) {
      e.preventDefault();
      handleDragStart(e.touches[0].clientX);
    }
  };

  const onTouchMove = useCallback((e: TouchEvent) => {
    if (e.touches.length > 0) {
      e.preventDefault();
      handleDragMove(e.touches[0].clientX);
    }
  }, [handleDragMove]);

  const onTouchEnd = useCallback(() => {
    handleDragEnd();
  }, [handleDragEnd]);

  // Event listeners
  useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onMouseUp);
      window.addEventListener('touchmove', onTouchMove, { passive: false });
      window.addEventListener('touchend', onTouchEnd);

      return () => {
        window.removeEventListener('mousemove', onMouseMove);
        window.removeEventListener('mouseup', onMouseUp);
        window.removeEventListener('touchmove', onTouchMove);
        window.removeEventListener('touchend', onTouchEnd);
      };
    }
  }, [isDragging, onMouseMove, onMouseUp, onTouchMove, onTouchEnd]);

  if (!map) return null;

  // Only render when enabled
  if (!enabled || !map) return null;

  return (
    <>
      {/* Right Map - clipped to show only right portion */}
      <div 
        ref={rightMapContainerRef}
        className="absolute inset-0 w-full h-full rounded-lg overflow-hidden border"
        style={{ 
          zIndex: 5,
          clipPath: `inset(0 0 0 ${sliderPosition}%)` // Show only right side
        }}
      />



      {/* Slider UI */}
      <div
        ref={containerRef}
        className="absolute inset-0 pointer-events-none"
        style={{ zIndex: 10 }}
      >
            {/* Vertical slider line */}
            <div
              className="absolute top-0 bottom-0 w-1 bg-white shadow-[0_0_15px_rgba(0,0,0,0.4)] pointer-events-auto cursor-ew-resize hover:bg-white/90 transition-colors"
              style={{
                left: `${sliderPosition}%`,
                transform: 'translateX(-50%)',
              }}
              onMouseDown={onMouseDown}
              onTouchStart={onTouchStart}
            >
              {/* Slider handle */}
              <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-10 h-10 bg-white rounded-full shadow-lg flex items-center justify-center border border-gray-200 transition-transform hover:scale-105 active:scale-95">
                <MoveHorizontal className="w-5 h-5 text-gray-700" />
              </div>
            </div>

            {/* Position indicator */}
            <div
              className="absolute top-8 bg-gradient-to-r from-blue-600 to-blue-500 text-white px-4 py-2 rounded-lg shadow-xl text-sm font-bold pointer-events-none border border-blue-400"
              style={{
                left: `${sliderPosition}%`,
                transform: 'translateX(-50%)',
              }}
            >
              {Math.round(sliderPosition)}%
            </div>


          </div>
    </>
  );
};

export default DualMapSwipe;
