import { useEffect, useRef, useState, useCallback } from 'react';
import mapboxgl from 'mapbox-gl';
import { Button } from '@/components/ui/button';
import { MoveHorizontal, X } from 'lucide-react';

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
      bearing: map.getBearing(),
      pitch: map.getPitch(),
      accessToken: mapboxAccessToken
    });

    rightMapRef.current = rightMap;
    isCreatingMapRef.current = false;

    rightMap.on('load', () => {
      console.log('✅ Right map loaded');

      // Wait for style to fully load before modifying layers
      rightMap.once('idle', () => {
        console.log('🎯 Right map idle, applying swipe layer removal');
        
        // Hide ALL vector layers on right map (they should only show on left/main map)
        const rightStyle = rightMap.getStyle();
        if (rightStyle && rightStyle.layers) {
          rightStyle.layers.forEach((layer: any) => {
            if (layer.id.startsWith('vector-layer-')) {
              try {
                rightMap.setLayoutProperty(layer.id, 'visibility', 'none');
                console.log(`👁️ Hidden vector layer ${layer.id} on right map`);
              } catch (e) {
                console.warn(`Could not hide vector layer ${layer.id}:`, e);
              }
            }
          });
        }
        
        // Show/Hide target layers appropriately on right map
        
        // 1. Right map ALWAYS hides leftLayerId (if it exists)
        if (leftLayerId && rightMap.getLayer(leftLayerId)) {
          try {
            rightMap.setLayoutProperty(leftLayerId, 'visibility', 'none');
            console.log(`👁️ Left layer ${leftLayerId} explicitly hidden from right map`);
          } catch (e) {
            console.warn(`Could not hide left layer ${leftLayerId} on right map:`, e);
          }
        }

        // 2. Main map ALWAYS hides rightLayerId (if it exists)
        // Note: we're applying this to `map` (main map), so we should do this dynamically in a separate useEffect
        // But for rightMap setup, we only manage what rightMap shows.
        
        // Right map should explicitly SHOW rightLayerId if it was hidden by default
        if (rightLayerId && rightMap.getLayer(rightLayerId)) {
          try {
            rightMap.setLayoutProperty(rightLayerId, 'visibility', 'visible');
            console.log(`👁️ Right layer ${rightLayerId} explicitly shown on right map`);
          } catch (e) {
            console.warn(`Could not show right layer ${rightLayerId} on right map:`, e);
          }
        }
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

  // ── Separate effect: update right-map layer visibility when selection changes ──
  useEffect(() => {
    if (!enabled || !rightMapRef.current) return;

    // On right map: show everything EXCEPT rightLayerId (Wait, right map should ONLY show rightLayerId)
    const applyRightMapVisibility = () => {
      const rightMap = rightMapRef.current;
      if (!rightMap || !rightMap.loaded() || !rightMap.isStyleLoaded()) return;
      try {
        const style = rightMap.getStyle();
        if (!style?.layers) return;
        style.layers.forEach((l: any) => {
          if (l.id.startsWith('tileset-layer-') || l.id.startsWith('health-map-layer-') || l.id.startsWith('vector-layer-')) {
            const isTarget = l.id === rightLayerId;
            if (isTarget) {
              rightMap.setLayoutProperty(l.id, 'visibility', 'visible');
            } else {
              rightMap.setLayoutProperty(l.id, 'visibility', 'none');
            }
          }
        });
      } catch (e) {
        console.warn('Could not apply right map visibility:', e);
      }
    };

    applyRightMapVisibility();
    
    // We can run this once on 'idle' to catch any layers that loaded late,
    // but we must remove it immediately to avoid infinite layout loops.
    const onIdle = () => {
        applyRightMapVisibility();
        rightMapRef.current?.off('idle', onIdle);
    };
    rightMapRef.current.on('idle', onIdle);

    return () => {
      if (rightMapRef.current) rightMapRef.current.off('idle', onIdle);
      // Main map restoration is handled by MapboxGolfCourseMap's syncLayerOrder when swipe becomes disabled.
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

      // 1. Remove layers from right map that don't exist in main map anymore
      rightStyle.layers.forEach((layer: any) => {
        if ((layer.id.startsWith('tileset-layer-') || 
             layer.id.startsWith('health-map-layer-') ||
             layer.id.startsWith('vector-layer-')) && 
            !mainLayerIds.has(layer.id)) {
          // If this layer was explicitly added to right map by another mechanic, keep it? 
          // No, we sync strictly with main map structure.
          try {
            const sourceId = layer.source;
            if (rightMap.getLayer(layer.id)) {
              rightMap.removeLayer(layer.id);
              console.log(`🗑️ Removed orphaned layer ${layer.id} from right map`);
            }
            // Also remove the source if it exists and no other layer uses it
            if (sourceId && rightMap.getSource(sourceId)) {
              // Check if any other layer uses this source
              const rightLayers = rightMap.getStyle()?.layers || [];
              const sourceInUse = rightLayers.some((l: any) => l.source === sourceId && l.id !== layer.id);
              if (!sourceInUse) {
                rightMap.removeSource(sourceId);
                console.log(`🗑️ Removed orphaned source ${sourceId} from right map`);
              }
            }
          } catch (e) {
            console.warn(`Could not remove layer ${layer.id}:`, e);
          }
        }
        
        // Re-enforce explicit visibilities during sync
        if (layer.id === leftLayerId) {
           try {
              if (rightMap.getLayoutProperty(layer.id, 'visibility') !== 'none') {
                rightMap.setLayoutProperty(layer.id, 'visibility', 'none');
              }
           } catch(e){}
        }
        if (layer.id === rightLayerId) {
           try {
              if (rightMap.getLayoutProperty(layer.id, 'visibility') !== 'visible') {
                 rightMap.setLayoutProperty(layer.id, 'visibility', 'visible');
              }
           } catch(e){}
        }
      });

      // 3. Add new layers to right map that exist in main but not in right
      mainStyle.layers.forEach((layer: any) => {
        if ((layer.id.startsWith('tileset-layer-') || 
             layer.id.startsWith('health-map-layer-') ||
             layer.id.startsWith('vector-layer-')) && 
            !rightMap.getLayer(layer.id)) {
          try {
            // Get the source from main map
            const sourceId = layer.source;
            
            if (!rightMap.getSource(sourceId)) {
              const mainSource = map.getSource(sourceId);
              
              if (mainSource) {
                // For GeoJSON sources (vector layers), get the data directly
                if ((mainSource as any).type === 'geojson') {
                  const geojsonData = (mainSource as any)._data;
                  rightMap.addSource(sourceId, {
                    type: 'geojson',
                    data: geojsonData
                  });
                  console.log(`➕ Added GeoJSON source ${sourceId} to right map`);
                } else {
                  // For raster sources, serialize normally
                  const sourceData = (mainSource as any).serialize();
                  rightMap.addSource(sourceId, sourceData);
                  console.log(`➕ Added raster source ${sourceId} to right map`);
                }
              }
            }

            // Add layer to right map if source exists
            if (rightMap.getSource(sourceId)) {
              // Clone the layer definition
              const layerDef = JSON.parse(JSON.stringify(layer));

              // Hide left layer explicitly
              if (layer.id === leftLayerId) {
                if (!layerDef.layout) layerDef.layout = {};
                layerDef.layout.visibility = 'none';
              }
              
              // Show right layer explicitly
              if (layer.id === rightLayerId) {
                 if (!layerDef.layout) layerDef.layout = {};
                 layerDef.layout.visibility = 'visible';
              }
              
              rightMap.addLayer(layerDef);
              console.log(`➕ Added layer ${layer.id} to right map`);
            }
          } catch (e) {
            console.warn(`Could not add layer ${layer.id} to right map:`, e);
          }
        }
      });
    };

    // Sync immediately
    syncLayers();

    // Set up interval to keep syncing (in case of changes)
    const intervalId = setInterval(syncLayers, 500);

    return () => {
      clearInterval(intervalId);
    };
  }, [enabled, map, leftLayerId, rightLayerId]);

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
