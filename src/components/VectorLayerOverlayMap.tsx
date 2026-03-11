import { useEffect, useRef, useState, useCallback } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { MapPin, Layers, Eye, EyeOff, AlertCircle, RefreshCw, ZoomIn, ZoomOut, Maximize2, X } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';

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

interface VectorLayerOverlayMapProps {
  golfCourseId: string;
  mapboxAccessToken: string;
  baseStyle?: string;
  showControls?: boolean;
  className?: string;
  // Optional: sync with raster map bounds
  initialBounds?: [[number, number], [number, number]];
  initialCenter?: [number, number];
  initialZoom?: number;
  // Map sync callback
  onMapReady?: (map: mapboxgl.Map) => void;
}

const VectorLayerOverlayMap = ({
  golfCourseId,
  mapboxAccessToken,
  baseStyle = 'mapbox://styles/mapbox/satellite-streets-v12',
  showControls = true,
  className = '',
  initialBounds,
  initialCenter = [-122.4, 37.8],
  initialZoom = 15,
  onMapReady
}: VectorLayerOverlayMapProps) => {
  const map = useRef<mapboxgl.Map | null>(null);
  const [vectorLayers, setVectorLayers] = useState<VectorLayer[]>([]);
  const [visibleLayers, setVisibleLayers] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showOverlayPanel, setShowOverlayPanel] = useState(true);
  const [courseBounds, setCourseBounds] = useState<[[number, number], [number, number]] | null>(null);
  const [courseCenter, setCourseCenter] = useState<[number, number] | null>(null);
  const [currentZoom, setCurrentZoom] = useState<number>(initialZoom);
  const [mapContainerElement, setMapContainerElement] = useState<HTMLDivElement | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const layersLoadedRef = useRef(false); // Prevent duplicate loading
  const mapInitializedRef = useRef(false); // Track if map has been initialized

  // Callback ref to track when container is mounted
  const mapContainer = useCallback((node: HTMLDivElement | null) => {
    if (node) {
      console.log('✅ Map container mounted');
      setMapContainerElement(node);
    }
  }, []);

  // Set Mapbox access token
  mapboxgl.accessToken = mapboxAccessToken;

  // Load vector layers and course bounds
  const loadVectorLayers = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error('No active session');
      }

      // Get golf course tileset for bounds
      const { data: tileset, error: tilesetError } = await supabase
        .from('golf_course_tilesets')
        .select('*')
        .eq('golf_course_id', golfCourseId)
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (!tilesetError && tileset) {
        setCourseBounds([
          [tileset.min_lon, tileset.min_lat],
          [tileset.max_lon, tileset.max_lat]
        ]);
        setCourseCenter([tileset.center_lon, tileset.center_lat]);
        console.log('Course bounds loaded:', {
          bounds: [[tileset.min_lon, tileset.min_lat], [tileset.max_lon, tileset.max_lat]],
          center: [tileset.center_lon, tileset.center_lat]
        });
      }

      // Get vector layers from database
      const { data: layers, error: layersError } = await supabase
        .from('vector_layers')
        .select('*')
        .eq('golf_course_id', golfCourseId)
        .eq('is_active', true)
        .order('z_index', { ascending: true });

      if (layersError) throw layersError;

      if (!layers || layers.length === 0) {
        setError('No vector layers found for this golf course');
        setIsLoading(false);
        return;
      }

      setVectorLayers(layers);
      setVisibleLayers(new Set(layers.map(l => l.id))); // Auto-enable all layers
    } catch (err) {
      console.error('Failed to load vector layers:', err);
      setError('Failed to load vector layers');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadVectorLayers();
  }, [golfCourseId]);

  // Initialize map
  useEffect(() => {
    console.log('🔍 Map init useEffect triggered', {
      hasContainer: !!mapContainerElement,
      hasBounds: !!courseBounds,
      isInitialized: mapInitializedRef.current
    });

    // Wait for container and course bounds first
    if (!mapContainerElement || !courseBounds) {
      console.log('⏸️ Waiting for map container and course bounds...');
      return;
    }

    // Don't initialize if already initialized
    if (mapInitializedRef.current) {
      console.log('⏭️ Map already initialized, skipping');
      return;
    }

    console.log('🗺️ Initializing map with bounds:', courseBounds);
    mapInitializedRef.current = true; // Mark as initialized
    
    try {
      const mapConfig: any = {
        container: mapContainerElement,
        style: baseStyle,
        center: courseCenter || initialCenter,
        zoom: initialZoom,
        bounds: courseBounds,
        fitBoundsOptions: { padding: 50 }
      };

      map.current = new mapboxgl.Map(mapConfig);

      // Add navigation controls
      if (showControls) {
        map.current.addControl(new mapboxgl.NavigationControl(), 'top-right');
        map.current.addControl(new mapboxgl.ScaleControl(), 'bottom-left');
        map.current.addControl(new mapboxgl.FullscreenControl(), 'top-right');
      }

      // Track zoom changes
      map.current.on('zoom', () => {
        if (map.current) {
          setCurrentZoom(Math.round(map.current.getZoom()));
        }
      });

      map.current.on('load', () => {
        console.log('Vector overlay map loaded successfully');
        // Notify parent that map is ready for sync
        if (onMapReady && map.current) {
          onMapReady(map.current);
        }
        // Trigger layer loading
        setMapReady(true);
      });

    } catch (err) {
      console.error('Failed to initialize vector map:', err);
      setError('Failed to initialize map');
    }

    return () => {
      map.current?.remove();
      map.current = null;
    };
  }, [mapContainerElement, courseBounds]); // Run when container is ready AND bounds are available

  // Load all layers onto the map (runs once)
  useEffect(() => {
    console.log('🔍 Layer loading effect triggered', {
      mapReady,
      hasMap: !!map.current,
      layersCount: vectorLayers.length,
      alreadyLoaded: layersLoadedRef.current
    });

    if (!mapReady || !map.current || vectorLayers.length === 0 || layersLoadedRef.current) {
      console.log('⏸️ Not ready to load layers');
      return;
    }

    const loadAllLayers = async () => {
      console.log('🔍 loadAllLayers called', {
        hasMap: !!map.current,
        isLoaded: map.current?.loaded(),
        isStyleLoaded: map.current?.isStyleLoaded(),
        layersCount: vectorLayers.length
      });

      // Wait for map to be fully loaded - check both loaded() and isStyleLoaded()
      if (!map.current!.loaded() || !map.current!.isStyleLoaded()) {
        console.log('⏳ Waiting for map to load before loading layers...');
        
        // Set up load listener
        const handleLoad = () => {
          console.log('🎉 Map load event fired! Now loading layers...');
          loadAllLayers();
        };
        
        // Try both events
        if (!map.current!.loaded()) {
          map.current!.once('load', handleLoad);
        } else if (!map.current!.isStyleLoaded()) {
          map.current!.once('styledata', handleLoad);
        }
        
        // Fallback: if map doesn't fire event within 2 seconds, try anyway
        setTimeout(() => {
          if (map.current && (map.current.loaded() || map.current.isStyleLoaded())) {
            console.log('⏰ Timeout fallback: Loading layers now');
            loadAllLayers();
          }
        }, 2000);
        
        return;
      }

      console.log(`🔄 Loading ${vectorLayers.length} vector layers...`);
      layersLoadedRef.current = true; // Mark as loading to prevent duplicates

      const r2PublicUrl = import.meta.env.VITE_R2_PUBLIC_URL;

      for (const layer of vectorLayers) {
        const sourceId = `vector-source-${layer.id}`;
        const layerId = `vector-layer-${layer.id}`;

        // Skip if already exists
        if (map.current!.getSource(sourceId)) {
          console.log(`   ⏭️ Skipping ${layer.name} (already loaded)`);
          continue;
        }

        console.log(`   Loading: ${layer.name}`);

        try {
          let geojsonData;
          
          // Try R2 public URL first, fallback to edge function
          if (r2PublicUrl) {
            const geojsonUrl = `${r2PublicUrl}/${layer.r2_key}`;
            console.log(`      Fetching from R2: ${geojsonUrl}`);
            const response = await fetch(geojsonUrl);
            if (!response.ok) {
              console.error(`      ❌ R2 fetch failed: ${response.status} ${response.statusText}`);
              throw new Error(`Failed to fetch ${layer.name}: ${response.statusText}`);
            }
            geojsonData = await response.json();
            console.log(`      ✅ R2 fetch successful`);
          } else {
            // Fallback: Use edge function to get signed URL
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
            
            // Fetch GeoJSON from signed URL
            const geoResponse = await fetch(layerData.urlWithCache || layerData.url);
            if (!geoResponse.ok) throw new Error('Failed to fetch GeoJSON');
            geojsonData = await geoResponse.json();
          }

          // Add source
          map.current!.addSource(sourceId, {
            type: 'geojson',
            data: geojsonData
          });

          // Determine layer style based on geometry type
          const geometryType = geojsonData.features[0]?.geometry?.type;
          const layerColor = getLayerColor(layer.name);
          
          console.log(`      Geometry: ${geometryType}, Color: ${layerColor}, Features: ${geojsonData.features.length}`);
          
          if (geometryType === 'Polygon' || geometryType === 'MultiPolygon') {
            // Add fill layer
            map.current!.addLayer({
              id: layerId,
              type: 'fill',
              source: sourceId,
              paint: {
                'fill-color': layerColor,
                'fill-opacity': 0.5
              }
            });

            // Add outline layer
            map.current!.addLayer({
              id: `${layerId}-outline`,
              type: 'line',
              source: sourceId,
              paint: {
                'line-color': layerColor,
                'line-width': 2
              }
            });
          } else if (geometryType === 'LineString' || geometryType === 'MultiLineString') {
            map.current!.addLayer({
              id: layerId,
              type: 'line',
              source: sourceId,
              paint: {
                'line-color': layerColor,
                'line-width': 3
              }
            });
          } else if (geometryType === 'Point' || geometryType === 'MultiPoint') {
            map.current!.addLayer({
              id: layerId,
              type: 'circle',
              source: sourceId,
              paint: {
                'circle-radius': 6,
                'circle-color': layerColor,
                'circle-stroke-width': 2,
                'circle-stroke-color': '#ffffff'
              }
            });
          }

          console.log(`      ✅ Loaded: ${layer.name}`);
        } catch (error) {
          console.error(`   ❌ Failed to load ${layer.name}:`, error);
        }
      }
      
      console.log(`✅ Finished loading all ${vectorLayers.length} layers`);
    };

    loadAllLayers();
  }, [mapReady, vectorLayers]); // Trigger when map is ready OR layers change


  // Get color for layer based on name
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
    
    // Default colors
    const colors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E2'];
    const hash = name.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    return colors[hash % colors.length];
  };

  // Toggle layer visibility
  const toggleLayerVisibility = (layerId: string) => {
    const layer = vectorLayers.find(l => l.id === layerId);
    if (!layer) return;

    console.log(`🔄 Toggling layer: ${layer.name}`);

    setVisibleLayers(prev => {
      const newSet = new Set(prev);
      if (newSet.has(layerId)) {
        // Hide layer
        console.log(`   👁️‍🗨️ Hiding layer: ${layer.name}`);
        newSet.delete(layerId);
        const mapLayerId = `vector-layer-${layerId}`;
        if (map.current && map.current.getLayer(mapLayerId)) {
          map.current.setLayoutProperty(mapLayerId, 'visibility', 'none');
          if (map.current.getLayer(`${mapLayerId}-outline`)) {
            map.current.setLayoutProperty(`${mapLayerId}-outline`, 'visibility', 'none');
          }
        }
      } else {
        // Show layer
        console.log(`   👁️ Showing layer: ${layer.name}`);
        newSet.add(layerId);
        const mapLayerId = `vector-layer-${layerId}`;
        if (map.current && map.current.getLayer(mapLayerId)) {
          map.current.setLayoutProperty(mapLayerId, 'visibility', 'visible');
          if (map.current.getLayer(`${mapLayerId}-outline`)) {
            map.current.setLayoutProperty(`${mapLayerId}-outline`, 'visibility', 'visible');
          }
        } else {
          console.warn(`   ⚠️ Layer ${layer.name} not found on map!`);
        }
      }
      return newSet;
    });
  };

  // Toggle all layers
  const toggleAllLayers = () => {
    console.log(`🔄 Toggle All Layers - Current visible: ${visibleLayers.size}/${vectorLayers.length}`);
    
    if (visibleLayers.size === vectorLayers.length) {
      // Hide all layers
      console.log('   👁️‍🗨️ Hiding all layers');
      setVisibleLayers(new Set());
      vectorLayers.forEach(layer => {
        const layerId = `vector-layer-${layer.id}`;
        if (map.current && map.current.getLayer(layerId)) {
          map.current.setLayoutProperty(layerId, 'visibility', 'none');
          if (map.current.getLayer(`${layerId}-outline`)) {
            map.current.setLayoutProperty(`${layerId}-outline`, 'visibility', 'none');
          }
        }
      });
    } else {
      // Show all layers
      console.log('   👁️ Showing all layers');
      setVisibleLayers(new Set(vectorLayers.map(l => l.id)));
      vectorLayers.forEach(layer => {
        const layerId = `vector-layer-${layer.id}`;
        if (map.current && map.current.getLayer(layerId)) {
          map.current.setLayoutProperty(layerId, 'visibility', 'visible');
          if (map.current.getLayer(`${layerId}-outline`)) {
            map.current.setLayoutProperty(`${layerId}-outline`, 'visibility', 'visible');
          }
        } else {
          console.warn(`   ⚠️ Layer ${layer.name} not found on map!`);
        }
      });
    }
  };

  // Zoom controls
  const zoomIn = () => {
    map.current?.zoomIn();
  };

  const zoomOut = () => {
    map.current?.zoomOut();
  };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      mapContainer.current?.requestFullscreen();
    } else {
      document.exitFullscreen();
    }
  };

  if (isLoading) {
    return (
      <Card className={className}>
        <CardContent className="p-8 text-center">
          <div className="space-y-4">
            <div className="animate-spin w-16 h-16 border-2 border-primary border-t-transparent rounded-full mx-auto" />
            <h3 className="text-lg font-medium">Loading Vector Layers</h3>
            <p className="text-muted-foreground">Fetching overlay data...</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error || vectorLayers.length === 0) {
    return (
      <Card className={className}>
        <CardContent className="p-8 text-center">
          <div className="space-y-4">
            <div className="w-16 h-16 mx-auto bg-muted rounded-full flex items-center justify-center">
              <AlertCircle className="w-8 h-8 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-medium">No Vector Layers</h3>
            <p className="text-muted-foreground">
              {error || 'No vector overlay layers found for this golf course'}
            </p>
            <Button onClick={loadVectorLayers} variant="outline" size="sm">
              <RefreshCw className="w-4 h-4 mr-2" />
              Retry
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="relative">
      <Card className={className}>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Layers className="w-5 h-5" />
              Vector Layer Overlays
            </div>
            <div className="flex flex-col items-end gap-2">
              {/* Top Row: Badges */}
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="text-xs">
                  Zoom {currentZoom}
                </Badge>
                <Badge variant="secondary" className="text-xs">
                  {visibleLayers.size} / {vectorLayers.length} Visible
                </Badge>
              </div>
              
              {/* Bottom Row: Control Buttons */}
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={zoomIn}
                  title="Zoom In"
                >
                  <ZoomIn className="w-4 h-4" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={zoomOut}
                  title="Zoom Out"
                >
                  <ZoomOut className="w-4 h-4" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={toggleFullscreen}
                  title="Fullscreen"
                >
                  <Maximize2 className="w-4 h-4" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowOverlayPanel(!showOverlayPanel)}
                  className="gap-2"
                >
                  <Layers className="w-4 h-4" />
                  Layers
                </Button>
              </div>
            </div>
          </CardTitle>
        </CardHeader>

        <CardContent className="relative">
          <div 
            ref={mapContainer} 
            className="w-full h-[600px] rounded-lg overflow-hidden border"
          />
        </CardContent>
      </Card>

      {/* Sliding Layer Panel - Transitions from Right */}
      <div
        className={`fixed top-0 right-0 h-full w-80 bg-background border-l shadow-2xl z-50 transform transition-transform duration-300 ease-in-out ${
          showOverlayPanel ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="flex flex-col h-full">
          {/* Panel Header */}
          <div className="flex items-center justify-between p-4 border-b">
            <div className="flex items-center gap-2">
              <Layers className="w-5 h-5" />
              <h3 className="font-semibold text-lg">Vector Layers</h3>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setShowOverlayPanel(false)}
            >
              <X className="w-4 h-4" />
            </Button>
          </div>

          {/* Layer Count & Toggle All */}
          <div className="flex items-center justify-between p-4 border-b bg-muted/30">
            <div className="text-sm text-muted-foreground">
              {visibleLayers.size} of {vectorLayers.length} layers visible
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={toggleAllLayers}
            >
              {visibleLayers.size === vectorLayers.length ? 'Hide All' : 'Show All'}
            </Button>
          </div>

          {/* Layers List */}
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
                      checked={visibleLayers.has(layer.id)}
                      onCheckedChange={() => toggleLayerVisibility(layer.id)}
                    />
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        </div>
      </div>

      {/* Backdrop Overlay */}
      {showOverlayPanel && (
        <div
          className="fixed inset-0 bg-black/20 z-40 transition-opacity duration-300"
          onClick={() => setShowOverlayPanel(false)}
        />
      )}
    </div>
  );
};

export default VectorLayerOverlayMap;
