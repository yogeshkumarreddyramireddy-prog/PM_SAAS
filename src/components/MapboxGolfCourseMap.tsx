import { useEffect, useRef, useState, useCallback } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { MapPin, Layers, ZoomIn, ZoomOut, Maximize2, AlertCircle, Activity, ArrowRight, ArrowDown, ArrowLeft, ArrowUp, X, MoveHorizontal } from 'lucide-react';
import { TilesetService } from '@/lib/tilesetService';
import { supabase } from '@/integrations/supabase/client';
import DateLayerDropdown from '@/components/DateLayerDropdown';
import MapSwipeControl from '@/components/MapSwipeControl';
import DualMapSwipe from '@/components/DualMapSwipe';
import HealthMapStack from '@/components/HealthMapStack';
import HealthMapDropdown from '@/components/HealthMapDropdown';
import { ScrollArea } from '@/components/ui/scroll-area';


import { GolfCourseTileset } from "@/lib/tilesetService";

interface VectorLayer {
  id: string;
  name: string;
  description: string;
  layer_type: string;
  r2_key: string;
  golf_course_id: string;
  course_name: string;
  is_active: boolean;
  z_index: number;
  created_at: string;
  updated_at: string;
}

interface MapboxGolfCourseMapProps {
  golfCourseId: string;
  mapboxAccessToken: string;
  baseStyle?: string;
  showControls?: boolean;
  className?: string;
  onMapReady?: (map: mapboxgl.Map) => void;
}

const MapboxGolfCourseMap = ({
  golfCourseId,
  mapboxAccessToken,
  baseStyle = 'mapbox://styles/mapbox/satellite-streets-v12',
  showControls = true,
  className = '',
  onMapReady
}: MapboxGolfCourseMapProps) => {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const [tilesets, setTilesets] = useState<GolfCourseTileset[]>([]);
  const [selectedLayers, setSelectedLayers] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentZoom, setCurrentZoom] = useState<number>(16);
  const [swipeMode, setSwipeMode] = useState(false);
  const [showHealthMaps, setShowHealthMaps] = useState(false);
  const [healthMapTilesets, setHealthMapTilesets] = useState<any[]>([]);
  const [selectedHealthMapIds, setSelectedHealthMapIds] = useState<string[]>([]);
  const [containerReady, setContainerReady] = useState(false);
  const [healthMapLoaded, setHealthMapLoaded] = useState(false);
  const [healthMapOpacity, setHealthMapOpacity] = useState(0.7);
  const [isAnimating, setIsAnimating] = useState(false);
  const animationRef = useRef<number | null>(null);
  const mapInitializedRef = useRef(false);
  const [mapReady, setMapReady] = useState(false);
  
  // Vector layer states
  const [vectorLayers, setVectorLayers] = useState<VectorLayer[]>([]);
  const [visibleVectorLayers, setVisibleVectorLayers] = useState<Set<string>>(new Set());
  const [showVectorLayerPanel, setShowVectorLayerPanel] = useState(false);
  const [vectorLayersAboveHealth, setVectorLayersAboveHealth] = useState(true);
  
  // Raster layer control - lazy loading (starts OFF, loads when toggled ON)
  const [showRasterLayers, setShowRasterLayers] = useState(false);
  const rasterLoadingRef = useRef(false);
  const [rasterLayersLoaded, setRasterLayersLoaded] = useState(false);
  
  // Layer swipe control
  const [swipeEnabled, setSwipeEnabled] = useState(false);
  const [swipeLayerId, setSwipeLayerId] = useState<string | null>(null);
  const lastSwipeLayerRef = useRef<string | null>(null);

  mapboxgl.accessToken = mapboxAccessToken;

  const setMapContainerRef = useCallback((node: HTMLDivElement | null) => {
    if (node && !mapContainer.current) {
      console.log('✅ Main map container mounted');
      mapContainer.current = node;
      setContainerReady(true);
    }
  }, []);

  // Load all tilesets for the golf club
  useEffect(() => {
    const loadTilesets = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const tilesetsData = await TilesetService.getTilesetsForGolfClub(golfCourseId);
        
        if (!tilesetsData || tilesetsData.length === 0) {
          setError('No tilesets found for this golf course');
          setIsLoading(false);
          return;
        }

        setTilesets(tilesetsData);
        if (tilesetsData.length > 0) {
          setSelectedLayers([tilesetsData[0].id]);
        }

        console.log('Loading health maps for golf_course_id:', golfCourseId);
        const { data: healthMaps, error: healthError } = await supabase
          .from('health_map_tilesets')
          .select('*')
          .eq('golf_course_id', golfCourseId)
          .eq('is_active', true)
          .order('analysis_date', { ascending: false })
          .order('analysis_time', { ascending: false });

        if (healthError) {
          console.error('Error loading health maps:', healthError);
        } else if (healthMaps) {
          console.log('Loaded health maps:', healthMaps);
          setHealthMapTilesets(healthMaps);
        } else {
          console.log('No health maps found');
        }
        
        console.log('Loading vector layers for golf_course_id:', golfCourseId);
        const { data: vectorLayersData, error: vectorError } = await supabase
          .from('vector_layers')
          .select('*')
          .eq('golf_course_id', golfCourseId)
          .eq('is_active', true)
          .order('z_index', { ascending: true });

        if (vectorError) {
          console.error('Error loading vector layers:', vectorError);
        } else if (vectorLayersData && vectorLayersData.length > 0) {
          console.log('Loaded vector layers:', vectorLayersData);
          setVectorLayers(vectorLayersData);
        } else {
          console.log('No vector layers found');
        }
      } catch (err) {
        console.error('Failed to load tilesets:', err);
        setError('Failed to load map data');
      } finally {
        setIsLoading(false);
      }
    };

    loadTilesets();
  }, [golfCourseId]);

  // Initialize map
  useEffect(() => {
    console.log('🗺️ Map init check:', {
      hasContainer: !!mapContainer.current,
      tilesetsCount: tilesets.length,
      mapAlreadyExists: !!map.current,
      mapInitialized: mapInitializedRef.current,
      containerReady
    });

    if (mapInitializedRef.current) {
      console.log('⏸️ Map already initialized, skipping');
      return;
    }

    if (!mapContainer.current || tilesets.length === 0 || map.current) {
      console.log('⏸️ Skipping map init - waiting for container or tilesets');
      return;
    }

    const primaryTileset = tilesets[0];
    console.log('✅ Initializing main map with tileset:', primaryTileset.name);

    mapInitializedRef.current = true;

    try {
      map.current = new mapboxgl.Map({
        container: mapContainer.current,
        style: baseStyle,
        center: [primaryTileset.center_lon, primaryTileset.center_lat],
        zoom: primaryTileset.default_zoom,
        minZoom: primaryTileset.min_zoom,
        maxZoom: primaryTileset.max_zoom,
        bounds: [
          [primaryTileset.min_lon, primaryTileset.min_lat],
          [primaryTileset.max_lon, primaryTileset.max_lat]
        ],
        fitBoundsOptions: {
          padding: 50
        }
      });

      if (showControls) {
        map.current.addControl(new mapboxgl.NavigationControl(), 'top-right');
        map.current.addControl(new mapboxgl.ScaleControl(), 'bottom-left');
        map.current.addControl(new mapboxgl.FullscreenControl(), 'top-right');
      }

      map.current.on('zoom', () => {
        if (map.current) {
          setCurrentZoom(Math.round(map.current.getZoom()));
        }
      });

      map.current.on('load', async () => {
        console.log('Map loaded successfully');
        setMapReady(true);
        
        console.log('onMapReady callback:', !!onMapReady, 'map.current:', !!map.current);
        if (onMapReady && map.current) {
          console.log('Calling onMapReady callback');
          onMapReady(map.current);
        }
      });

    } catch (err) {
      console.error('Failed to initialize map:', err);
      setError('Failed to initialize map');
      mapInitializedRef.current = false;
    }

    return () => {
      if (map.current) {
        map.current.remove();
        map.current = null;
        mapInitializedRef.current = false;
      }
    };
  }, [tilesets, baseStyle, showControls, containerReady]);

  // Load raster layers ONLY when toggle is ON (lazy loading)
  useEffect(() => {
    if (!map.current || !showRasterLayers || rasterLoadingRef.current || rasterLayersLoaded) {
      return;
    }

    const loadRasterTiles = async () => {
      if (!map.current!.loaded()) {
        map.current!.once('load', loadRasterTiles);
        return;
      }

      rasterLoadingRef.current = true;
      console.log(' Loading raster tiles (lazy load triggered)...');
      
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        console.error(' No active session for tile loading');
        rasterLoadingRef.current = false;
        return;
      }

      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;

      selectedLayers.forEach((tilesetId) => {
        const tileset = tilesets.find(t => t.id === tilesetId);
        if (!tileset) return;

        const sourceId = `tileset-source-${tileset.id}`;
        const layerId = `tileset-layer-${tileset.id}`;
        const tileUrlTemplate = `${supabaseUrl}/functions/v1/tile-proxy?tilesetId=${tileset.id}&z={z}&x={x}&y={y}&token=${session.access_token}`;

        console.log('Loading raster tiles:', tileset.name);

        if (!map.current!.getSource(sourceId)) {
          map.current!.addSource(sourceId, {
            type: 'raster',
            tiles: [tileUrlTemplate],
            tileSize: tileset.tile_size || 256,
            minzoom: tileset.min_zoom,
            maxzoom: tileset.max_zoom,
            bounds: [
              tileset.min_lon,
              tileset.min_lat,
              tileset.max_lon,
              tileset.max_lat
            ]
          });

          map.current!.addLayer({
            id: layerId,
            type: 'raster',
            source: sourceId,
            paint: {
              'raster-opacity': 0.85
            }
          });

          console.log(' Raster tiles loaded:', tileset.name);
        }
      });

      setRasterLayersLoaded(true);
    };

    loadRasterTiles();
  }, [showRasterLayers, selectedLayers, tilesets, mapReady]);

  // Control raster layer visibility (show/hide after loaded)
  useEffect(() => {
    if (!map.current || !rasterLayersLoaded) return;

    const visibility = showRasterLayers ? 'visible' : 'none';
    
    selectedLayers.forEach(tilesetId => {
      const layerId = `tileset-layer-${tilesetId}`;
      if (map.current!.getLayer(layerId)) {
        try {
          map.current!.setLayoutProperty(layerId, 'visibility', visibility);
        } catch (e) {
          console.warn(`Could not set visibility for ${layerId}:`, e);
        }
      }
    });
    
    console.log(`🎚️ Raster layers ${showRasterLayers ? 'shown' : 'hidden'}`);
  }, [showRasterLayers, selectedLayers, rasterLayersLoaded]);

  // FIX 3: Handle health map toggle - REMOVE layers when toggling off
  useEffect(() => {
    if (!map.current) {
      console.log('⏸️ Map not ready for health maps - no map instance');
      return;
    }

    if (!map.current.loaded()) {
      console.log('⏸️ Map not ready for health maps - waiting for load', {
        hasMap: true,
        isLoaded: false,
        showHealthMaps
      });
      
      if (!showHealthMaps) {
        return;
      }
      
      const handleMapLoad = () => {
        console.log('✅ Map loaded, will load health maps now');
      };
      
      map.current.once('idle', handleMapLoad);
      return () => {
        map.current?.off('idle', handleMapLoad);
      };
    }

    console.log('🔍 Health map effect triggered:', {
      showHealthMaps,
      selectedHealthMapIds,
      healthMapCount: healthMapTilesets.length
    });

    // FIX 3: If toggling off, REMOVE all health map layers (not just hide)
    if (!showHealthMaps) {
      healthMapTilesets.forEach(hm => {
        const layerId = `health-map-layer-${hm.id}`;
        const sourceId = `health-map-source-${hm.id}`;
        
        if (map.current!.getLayer(layerId)) {
          map.current!.removeLayer(layerId);
        }
        if (map.current!.getSource(sourceId)) {
          map.current!.removeSource(sourceId);
        }
      });
      console.log('🗑️ All health map layers removed');
      return;
    }

    // Load/show selected health maps
    if (showHealthMaps && selectedHealthMapIds.length > 0) {
      (async () => {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;

        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;

        // Remove layers that are no longer selected
        healthMapTilesets.forEach(hm => {
          if (!selectedHealthMapIds.includes(hm.id)) {
            const layerId = `health-map-layer-${hm.id}`;
            const sourceId = `health-map-source-${hm.id}`;
            if (map.current!.getLayer(layerId)) {
              map.current!.removeLayer(layerId);
            }
            if (map.current!.getSource(sourceId)) {
              map.current!.removeSource(sourceId);
            }
          }
        });

        // Add/update selected health maps in stack order
        for (let i = 0; i < selectedHealthMapIds.length; i++) {
          const healthMapId = selectedHealthMapIds[i];
          const healthMap = healthMapTilesets.find(h => h.id === healthMapId);
          if (!healthMap) continue;

          const layerId = `health-map-layer-${healthMapId}`;
          const sourceId = `health-map-source-${healthMapId}`;
          const tileUrlTemplate = `${supabaseUrl}/functions/v1/tile-proxy?tilesetId=${healthMap.id}&type=health&z={z}&x={x}&y={y}&token=${session.access_token}`;

          try {
            if (!map.current!.getSource(sourceId)) {
              map.current!.addSource(sourceId, {
                type: 'raster',
                tiles: [tileUrlTemplate],
                tileSize: 256,
                minzoom: healthMap.min_zoom,
                maxzoom: healthMap.max_zoom,
                bounds: [
                  healthMap.min_lon,
                  healthMap.min_lat,
                  healthMap.max_lon,
                  healthMap.max_lat
                ]
              });
            }

            if (!map.current!.getLayer(layerId)) {
              map.current!.addLayer({
                id: layerId,
                type: 'raster',
                source: sourceId,
                paint: {
                  'raster-opacity': 0.7
                }
              });
              console.log(`✅ Added health map layer: ${healthMap.name || layerId}`);
            } else {
              map.current!.setLayoutProperty(layerId, 'visibility', 'visible');
            }

            if (i < selectedHealthMapIds.length - 1) {
              const nextLayerId = `health-map-layer-${selectedHealthMapIds[i + 1]}`;
              if (map.current!.getLayer(nextLayerId)) {
                map.current!.moveLayer(layerId, nextLayerId);
              }
            }
          } catch (error) {
            console.error(`❌ Error adding health map layer ${healthMapId}:`, error);
          }
        }

        setHealthMapLoaded(true);
      })();
    }
  }, [showHealthMaps, selectedHealthMapIds, healthMapTilesets, rasterLayersLoaded]);

  // FIX 2: Load vector layers onto map (only when toggled visible)
  useEffect(() => {
    if (!map.current || !mapInitializedRef.current || vectorLayers.length === 0) {
      return;
    }

    if (!map.current.loaded() || !map.current.isStyleLoaded()) {
      return;
    }

    const r2PublicUrl = import.meta.env.VITE_R2_PUBLIC_URL;

    // Load only visible vector layers
    visibleVectorLayers.forEach(async (layerId) => {
      const layer = vectorLayers.find(l => l.id === layerId);
      if (!layer) return;

      const sourceId = `vector-source-${layer.id}`;
      const vectorLayerId = `vector-layer-${layer.id}`;

      // Skip if already loaded
      if (map.current!.getSource(sourceId)) {
        return;
      }

      console.log(`🔄 Loading vector layer: ${layer.name}`);

      try {
        let geojsonData;
        
        if (r2PublicUrl) {
          const geojsonUrl = `${r2PublicUrl}/${layer.r2_key}`;
          const response = await fetch(geojsonUrl);
          if (!response.ok) {
            throw new Error(`Failed to fetch ${layer.name}: ${response.statusText}`);
          }
          geojsonData = await response.json();
        } else {
          const { data: { session } } = await supabase.auth.getSession();
          if (!session) throw new Error('No session');
          
          const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
          const response = await fetch(
            `${supabaseUrl}/functions/v1/get-vector-layers?golf_course_id=${golfCourseId}`,
            {
              headers: {
                'Authorization': `Bearer ${session.access_token}`,
                'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY
              }
            }
          );
          
          if (!response.ok) throw new Error('Failed to fetch layers');
          const result = await response.json();
          const layerData = result.data.find((l: any) => l.id === layer.id);
          if (!layerData) throw new Error(`Layer ${layer.name} not found`);
          
          const geoResponse = await fetch(layerData.urlWithCache || layerData.url);
          if (!geoResponse.ok) throw new Error('Failed to fetch GeoJSON');
          geojsonData = await geoResponse.json();
        }

        map.current!.addSource(sourceId, {
          type: 'geojson',
          data: geojsonData
        });

        const geometryType = geojsonData.features[0]?.geometry?.type;
        const layerColor = getLayerColor(layer.name);
        
        if (geometryType === 'Polygon' || geometryType === 'MultiPolygon') {
          map.current!.addLayer({
            id: vectorLayerId,
            type: 'fill',
            source: sourceId,
            paint: {
              'fill-color': layerColor,
              'fill-opacity': 0.5
            },
            layout: {
              'visibility': 'visible'
            }
          });

          map.current!.addLayer({
            id: `${vectorLayerId}-outline`,
            type: 'line',
            source: sourceId,
            paint: {
              'line-color': layerColor,
              'line-width': 2
            },
            layout: {
              'visibility': 'visible'
            }
          });
        } else if (geometryType === 'LineString' || geometryType === 'MultiLineString') {
          map.current!.addLayer({
            id: vectorLayerId,
            type: 'line',
            source: sourceId,
            paint: {
              'line-color': layerColor,
              'line-width': 3
            },
            layout: {
              'visibility': 'visible'
            }
          });
        } else if (geometryType === 'Point' || geometryType === 'MultiPoint') {
          map.current!.addLayer({
            id: vectorLayerId,
            type: 'circle',
            source: sourceId,
            paint: {
              'circle-radius': 6,
              'circle-color': layerColor,
              'circle-stroke-width': 2,
              'circle-stroke-color': '#ffffff'
            },
            layout: {
              'visibility': 'visible'
            }
          });
        }
        
        // Move vector layers to top
        try {
          map.current!.moveLayer(vectorLayerId);
          if (map.current!.getLayer(`${vectorLayerId}-outline`)) {
            map.current!.moveLayer(`${vectorLayerId}-outline`);
          }
        } catch (e) {
          console.warn(`Could not move layer ${vectorLayerId} to top:`, e);
        }

        console.log(`✅ Loaded: ${layer.name}`);
      } catch (error) {
        console.error(`❌ Failed to load ${layer.name}:`, error);
      }
    });
  }, [visibleVectorLayers, vectorLayers, golfCourseId, mapReady]);

  // Track if user has ever selected a health map (to avoid auto-off on initial toggle)
  const hasEverSelectedHealthMap = useRef(false);
  
  // Track when health maps are selected
  useEffect(() => {
    if (selectedHealthMapIds.length > 0) {
      hasEverSelectedHealthMap.current = true;
    }
  }, [selectedHealthMapIds]);
  
  // Reset the flag when toggle is manually turned OFF
  useEffect(() => {
    if (!showHealthMaps) {
      hasEverSelectedHealthMap.current = false;
    }
  }, [showHealthMaps]);
  
  // Auto-toggle off health maps when all are deselected (only if user had previously selected some)
  useEffect(() => {
    if (showHealthMaps && selectedHealthMapIds.length === 0 && hasEverSelectedHealthMap.current) {
      console.log('🔄 All health maps deselected, turning off health maps');
      setShowHealthMaps(false);
    }
  }, [selectedHealthMapIds, showHealthMaps]);

  // Determine which layer to swipe (topmost layer)
  useEffect(() => {
    if (!swipeEnabled) {
      setSwipeLayerId(null);
      lastSwipeLayerRef.current = null;
      return;
    }

    // Wait for map to be ready
    if (!map.current || !map.current.loaded()) {
      return;
    }

    let targetLayerId: string | null = null;

    // Priority 1: Health maps (if enabled and selected)
    if (showHealthMaps && selectedHealthMapIds.length > 0) {
      const topHealthMapId = selectedHealthMapIds[selectedHealthMapIds.length - 1];
      const layerId = `health-map-layer-${topHealthMapId}`;
      if (map.current.getLayer(layerId)) {
        targetLayerId = layerId;
      }
    }

    // Priority 2: Visible vector layers (find first one that exists on map)
    if (!targetLayerId && visibleVectorLayers.size > 0) {
      for (const vectorLayerId of Array.from(visibleVectorLayers)) {
        const layerId = `vector-layer-${vectorLayerId}`;
        if (map.current.getLayer(layerId)) {
          targetLayerId = layerId;
          break;
        }
      }
    }

    // Priority 3: Raster layers
    if (!targetLayerId && rasterLayersLoaded && selectedLayers.length > 0) {
      const layerId = `tileset-layer-${selectedLayers[0]}`;
      if (map.current.getLayer(layerId)) {
        targetLayerId = layerId;
      }
    }

    // Only update if changed
    if (lastSwipeLayerRef.current !== targetLayerId) {
      lastSwipeLayerRef.current = targetLayerId;
      setSwipeLayerId(targetLayerId);
      console.log('🎚️ Swipe layer set to:', targetLayerId || 'none');
    }
  }, [swipeEnabled, showHealthMaps, selectedHealthMapIds, rasterLayersLoaded, selectedLayers, visibleVectorLayers, mapReady]);

  // Manage vector layer visibility and z-index
  useEffect(() => {
    if (!map.current || !map.current.loaded() || !mapInitializedRef.current) return;

    vectorLayers.forEach(layer => {
      const layerId = `vector-layer-${layer.id}`;
      const outlineLayerId = `${layerId}-outline`;
      
      const isVisible = visibleVectorLayers.has(layer.id);
      const visibility = isVisible ? 'visible' : 'none';
      
      if (map.current!.getLayer(layerId)) {
        map.current!.setLayoutProperty(layerId, 'visibility', visibility);
        
        if (isVisible) {
          try {
            map.current!.moveLayer(layerId);
            if (map.current!.getLayer(outlineLayerId)) {
              map.current!.moveLayer(outlineLayerId);
            }
            console.log(`📌 Moved ${layer.name} to top`);
          } catch (e) {
            console.warn('Could not move layer to top:', e);
          }
        }
      }
      
      if (map.current!.getLayer(outlineLayerId)) {
        map.current!.setLayoutProperty(outlineLayerId, 'visibility', visibility);
      }
    });
  }, [visibleVectorLayers, vectorLayers]);

  const getLayerMetadata = (layerId: string | null) => {
    if (!layerId) return undefined;

    if (layerId.startsWith('health-map-layer-')) {
      const healthMapId = layerId.replace('health-map-layer-', '');
      const healthMap = healthMapTilesets.find(hm => hm.id === healthMapId);
      if (healthMap) {
        return {
          name: healthMap.analysis_type || 'Health Map',
          date: `${healthMap.analysis_date} ${healthMap.analysis_time}`,
          type: 'health' as const
        };
      }
    }

    if (layerId.startsWith('vector-layer-')) {
      const vectorId = layerId.replace('vector-layer-', '');
      const vectorLayer = vectorLayers.find(vl => vl.id === vectorId);
      if (vectorLayer) {
        return {
          name: vectorLayer.name,
          date: vectorLayer.created_at ? new Date(vectorLayer.created_at).toLocaleDateString() : 'N/A',
          type: 'vector' as const
        };
      }
    }

    if (layerId.startsWith('tileset-layer-')) {
      const tilesetId = layerId.replace('tileset-layer-', '');
      const tileset = tilesets.find(t => t.id === tilesetId);
      if (tileset) {
        return {
          name: tileset.name || 'Raster Layer',
          date: tileset.created_at ? new Date(tileset.created_at).toLocaleDateString() : 'N/A',
          type: 'raster' as const
        };
      }
    }

    return undefined;
  };

  const getLayerBeneath = (topLayerId: string | null): string | null => {
    if (!topLayerId) return null;

    if (topLayerId.startsWith('health-map-layer-') && selectedHealthMapIds.length > 1) {
      const healthMapId = selectedHealthMapIds[selectedHealthMapIds.length - 2];
      return `health-map-layer-${healthMapId}`;
    }

    if (topLayerId.startsWith('health-map-layer-')) {
      if (selectedLayers.length > 0) {
        return `tileset-layer-${selectedLayers[0]}`;
      }
    }

    if (topLayerId.startsWith('tileset-layer-') && selectedLayers.length > 1) {
      return `tileset-layer-${selectedLayers[1]}`;
    }

    return null;
  };

  const getLayerColor = (name: string): string => {
    const lowerName = name.toLowerCase();
    
    if (lowerName.includes('fairway')) return '#90EE90';
    if (lowerName.includes('green')) return '#228B22';
    if (lowerName.includes('tee')) return '#FFD700';
    if (lowerName.includes('bunker') || lowerName.includes('sand')) return '#F4A460';
    if (lowerName.includes('water') || lowerName.includes('hazard')) return '#4169E1';
    if (lowerName.includes('rough')) return '#8B4513';
    if (lowerName.includes('boundary') || lowerName.includes('course')) return '#FF4500';
    if (lowerName.includes('path') || lowerName.includes('cart')) return '#A9A9A9';
    if (lowerName.includes('tree') || lowerName.includes('wood')) return '#006400';
    
    const colors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E2'];
    const hash = name.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    return colors[hash % colors.length];
  };

  const toggleVectorLayer = (layerId: string) => {
    setVisibleVectorLayers(prev => {
      const newSet = new Set(prev);
      if (newSet.has(layerId)) {
        newSet.delete(layerId);
      } else {
        newSet.add(layerId);
      }
      return newSet;
    });
  };

  const toggleAllVectorLayers = () => {
    if (visibleVectorLayers.size === vectorLayers.length) {
      setVisibleVectorLayers(new Set());
    } else {
      setVisibleVectorLayers(new Set(vectorLayers.map(l => l.id)));
    }
  };

  const animateSwipe = (direction: 'horizontal' | 'vertical', reverse: boolean = false) => {
    // Check if we have any selected health maps
    if (isAnimating || !map.current || selectedHealthMapIds.length === 0) return;
    
    // Check if at least one health map layer exists
    const existingLayers = selectedHealthMapIds.filter(id => 
      map.current?.getLayer(`health-map-layer-${id}`)
    );
    if (existingLayers.length === 0) return;
    
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
    }
    
    setIsAnimating(true);
    const startOpacity = reverse ? healthMapOpacity : 0;
    const endOpacity = reverse ? 0 : 1;
    const duration = 1500;
    const startTime = performance.now();
    
    const animate = (currentTime: number) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      
      const easeInOutCubic = (t: number) => 
        t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
      
      const easedProgress = easeInOutCubic(progress);
      const currentOpacity = startOpacity + (endOpacity - startOpacity) * easedProgress;
      
      setHealthMapOpacity(currentOpacity);
      
      // Apply opacity to ALL selected health map layers
      if (map.current) {
        selectedHealthMapIds.forEach(id => {
          const layerId = `health-map-layer-${id}`;
          if (map.current!.getLayer(layerId)) {
            map.current!.setPaintProperty(layerId, 'raster-opacity', currentOpacity);
          }
        });
      }
      
      if (progress < 1) {
        animationRef.current = requestAnimationFrame(animate);
      } else {
        setIsAnimating(false);
        animationRef.current = null;
      }
    };
    
    animationRef.current = requestAnimationFrame(animate);
  };

  const handleHorizontalSwipe = () => {
    animateSwipe('horizontal', false);
  };

  const handleReverseHorizontalSwipe = () => {
    animateSwipe('horizontal', true);
  };

  const handleLayerChange = (leftLayerId: string, rightLayerId: string | null) => {
    if (rightLayerId) {
      setSelectedLayers([leftLayerId, rightLayerId]);
      setSwipeMode(true);
    } else {
      setSelectedLayers([leftLayerId]);
      setSwipeMode(false);
    }
  };

  const zoomIn = () => {
    map.current?.zoomIn();
  };

  const zoomOut = () => {
    map.current?.zoomOut();
  };

  const resetView = () => {
    if (!map.current || tilesets.length === 0) return;
    
    const primaryTileset = tilesets[0];
    map.current.flyTo({
      center: [primaryTileset.center_lon, primaryTileset.center_lat],
      zoom: primaryTileset.default_zoom,
      essential: true
    });
  };

  if (isLoading) {
    return (
      <Card className={className}>
        <CardContent className="p-8 text-center">
          <div className="space-y-4">
            <div className="animate-spin w-16 h-16 border-2 border-primary border-t-transparent rounded-full mx-auto" />
            <h3 className="text-lg font-medium">Loading Map</h3>
            <p className="text-muted-foreground">Fetching golf course data...</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error || tilesets.length === 0) {
    return (
      <Card className={className}>
        <CardContent className="p-8 text-center">
          <div className="space-y-4">
            <div className="w-16 h-16 mx-auto bg-destructive/10 rounded-full flex items-center justify-center">
              <AlertCircle className="w-8 h-8 text-destructive" />
            </div>
            <h3 className="text-lg font-medium">Map Not Available</h3>
            <p className="text-muted-foreground">
              {error || 'No map data found for this golf course'}
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const canSwipe = selectedLayers.length === 2;

  return (
    <div className="space-y-4">
      <Card className={className}>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <MapPin className="w-5 h-5" />
              Golf Course Map
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="text-xs">
                Zoom: {currentZoom}
              </Badge>
              <Badge variant="outline" className="text-xs">
                {selectedLayers.length} {selectedLayers.length === 1 ? 'Layer' : 'Layers'}
              </Badge>
            </div>
          </CardTitle>

          {showControls && (
            <div className="flex flex-col gap-3 pt-2">
              {/* FIX 1: Raster Layer Toggle - updated to use showRasterLayers */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-blue-600" />
                  <span className="text-sm font-medium">Raster Layers (PNG Tiles)</span>
                  <Switch
                    checked={showRasterLayers}
                    onCheckedChange={setShowRasterLayers}
                  />
                </div>
                {rasterLayersLoaded && (
                  <Badge variant="outline" className="text-xs">
                    {showRasterLayers ? 'Visible' : 'Hidden'}
                  </Badge>
                )}
              </div>
              
              {/* Zoom controls */}
              <div className="flex items-center justify-end">
                <div className="flex items-center gap-1">
                  <Button variant="outline" size="sm" onClick={zoomOut}>
                    <ZoomOut className="w-4 h-4" />
                  </Button>
                  <Button variant="outline" size="sm" onClick={zoomIn}>
                    <ZoomIn className="w-4 h-4" />
                  </Button>
                  <Button variant="outline" size="sm" onClick={resetView}>
                    <Maximize2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
              
              {vectorLayers.length > 0 && (
                <div className="flex items-center justify-between border-t pt-3">
                  <div className="flex items-center gap-2">
                    <Layers className="w-4 h-4 text-purple-600" />
                    <span className="text-sm font-medium">Vector Layers</span>
                    <Badge variant="secondary" className="text-xs">
                      {visibleVectorLayers.size} / {vectorLayers.length}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-2">
                    {showHealthMaps && !swipeEnabled && (
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span>Position:</span>
                        <Button
                          variant={vectorLayersAboveHealth ? "default" : "outline"}
                          size="sm"
                          onClick={() => setVectorLayersAboveHealth(true)}
                          className="h-7 px-2 text-xs"
                        >
                          Above Health
                        </Button>
                        <Button
                          variant={!vectorLayersAboveHealth ? "default" : "outline"}
                          size="sm"
                          onClick={() => setVectorLayersAboveHealth(false)}
                          className="h-7 px-2 text-xs"
                        >
                          Below Health
                        </Button>
                      </div>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setShowVectorLayerPanel(!showVectorLayerPanel)}
                      className="gap-2"
                    >
                      <Layers className="w-4 h-4" />
                      Manage Layers
                    </Button>
                  </div>
                </div>
              )}
              
              <div className="flex items-center justify-between border-t pt-3">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">Layer Comparison</span>
                  {swipeLayerId && (
                    <Badge variant="secondary" className="text-xs">
                      Swipe: {swipeLayerId.replace('tileset-layer-', '').replace('vector-layer-', '').replace('health-map-layer', 'Health Map')}
                    </Badge>
                  )}
                </div>
                <Button
                  variant={swipeEnabled ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setSwipeEnabled(!swipeEnabled)}
                  className="gap-2"
                >
                  {swipeEnabled ? (
                    <>
                      <X className="w-4 h-4" />
                      Exit Swipe
                    </>
                  ) : (
                    <>
                      <MoveHorizontal className="w-4 h-4" />
                      Swipe Mode
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}
        </CardHeader>

      <CardContent>
        <div className="relative w-full h-[600px]">
          <div 
            ref={setMapContainerRef} 
            className="absolute inset-0 w-full h-full rounded-lg overflow-hidden border"
          />
          
          {/* Health Maps Dropdown - Floating top-left on map */}
          {healthMapTilesets.length > 0 && (
            <HealthMapDropdown
              healthMaps={healthMapTilesets}
              selectedIds={selectedHealthMapIds}
              onSelectionChange={setSelectedHealthMapIds}
              enabled={showHealthMaps}
              onToggleEnabled={(enabled) => {
                setShowHealthMaps(enabled);
                if (!enabled) {
                  setSelectedHealthMapIds([]);
                }
              }}
              opacity={healthMapOpacity}
              onOpacityChange={(opacity) => {
                setHealthMapOpacity(opacity);
                if (map.current) {
                  selectedHealthMapIds.forEach(id => {
                    const layerId = `health-map-layer-${id}`;
                    if (map.current!.getLayer(layerId)) {
                      map.current!.setPaintProperty(layerId, 'raster-opacity', opacity);
                    }
                  });
                }
              }}
              onAnimateIn={handleHorizontalSwipe}
              onAnimateOut={handleReverseHorizontalSwipe}
              isAnimating={isAnimating}
            />
          )}
          
          <DualMapSwipe
            map={map.current}
            layerId={swipeLayerId}
            enabled={swipeEnabled}
            onToggle={() => setSwipeEnabled(!swipeEnabled)}
            mapboxAccessToken={mapboxAccessToken}
            leftLayerMeta={getLayerMetadata(swipeLayerId)}
            rightLayerMeta={getLayerMetadata(getLayerBeneath(swipeLayerId))}
          />
        </div>
      </CardContent>
    </Card>

    {/* Raster Layer Selection - Below map card */}
    <DateLayerDropdown
      tilesets={tilesets}
      selectedLayers={selectedLayers}
      onLayerChange={handleLayerChange}
    />

    {map.current && map.current.loaded() && (
      <>
        {canSwipe && swipeMode && (
          <MapSwipeControl
            map={map.current}
            leftLayerId={`tileset-layer-${selectedLayers[0]}`}
            rightLayerId={`tileset-layer-${selectedLayers[1]}`}
            isActive={swipeMode}
            onToggle={() => setSwipeMode(!swipeMode)}
          />
        )}
        {showHealthMaps && selectedHealthMapIds.length > 0 && map.current.getLayer(`health-map-layer-${selectedHealthMapIds[selectedHealthMapIds.length - 1]}`) && (
          <MapSwipeControl
            map={map.current}
            leftLayerId={`tileset-layer-${selectedLayers[0]}`}
            rightLayerId={`health-map-layer-${selectedHealthMapIds[selectedHealthMapIds.length - 1]}`}
            isActive={true}
            onToggle={() => setShowHealthMaps(false)}
          />
        )}
      </>
    )}
      
      {vectorLayers.length > 0 && (
        <>
          <div
            className={`fixed top-0 right-0 h-full w-80 bg-background border-l shadow-2xl z-50 transform transition-transform duration-300 ease-in-out ${
              showVectorLayerPanel ? 'translate-x-0' : 'translate-x-full'
            }`}
          >
            <div className="flex flex-col h-full">
              <div className="flex items-center justify-between p-4 border-b">
                <div className="flex items-center gap-2">
                  <Layers className="w-5 h-5" />
                  <h3 className="font-semibold text-lg">Vector Layers</h3>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setShowVectorLayerPanel(false)}
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>

              <div className="flex items-center justify-between p-4 border-b bg-muted/30">
                <div className="text-sm text-muted-foreground">
                  {visibleVectorLayers.size} of {vectorLayers.length} layers visible
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={toggleAllVectorLayers}
                >
                  {visibleVectorLayers.size === vectorLayers.length ? 'Hide All' : 'Show All'}
                </Button>
              </div>

              <ScrollArea className="flex-1 p-4">
                <div className="space-y-3">
                  {vectorLayers.map((layer) => (
                    <div
                      key={layer.id}
                      className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50 transition-colors bg-card"
                    >
                      <div className="flex items-center gap-3 flex-1">
                        <div
                          className="w-4 h-4 rounded border-2 border-white shadow-sm flex-shrink-0"
                          style={{ backgroundColor: getLayerColor(layer.name) }}
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{layer.name}</p>
                          {layer.description && (
                            <p className="text-xs text-muted-foreground truncate">{layer.description}</p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <Switch
                          checked={visibleVectorLayers.has(layer.id)}
                          onCheckedChange={() => toggleVectorLayer(layer.id)}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </div>
          </div>

          {showVectorLayerPanel && (
            <div
              className="fixed inset-0 bg-black/20 z-40 transition-opacity duration-300"
              onClick={() => setShowVectorLayerPanel(false)}
            />
          )}
        </>
      )}
    </div>
  );
};

export default MapboxGolfCourseMap;