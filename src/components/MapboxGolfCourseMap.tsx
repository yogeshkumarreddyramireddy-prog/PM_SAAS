import { useEffect, useRef, useState, useCallback } from 'react';
import { useT } from '@/translations';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { MapPin, Layers, ZoomIn, ZoomOut, Maximize2, LocateFixed, AlertCircle, Activity, ArrowRight, ArrowDown, ArrowLeft, ArrowUp, X, MoveHorizontal, Tag } from 'lucide-react';
import { TilesetService } from '@/lib/tilesetService';
import { supabase } from '@/integrations/supabase/client';
import DateLayerDropdown from '@/components/DateLayerDropdown';
import RasterLayerDropdown from '@/components/RasterLayerDropdown';
import MapSwipeControl from '@/components/MapSwipeControl';
import DualMapSwipe from '@/components/DualMapSwipe';
import { applySwipeVisibility } from '@/lib/mapSwipeVisibility';
import HealthMapStack from '@/components/HealthMapStack';
import HealthMapDropdown from '@/components/HealthMapDropdown';
import { ScrollArea } from '@/components/ui/scroll-area';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { SortableLayerItem } from '@/components/SortableLayerItem';
import { AnalysisPanel } from '@/components/AnalysisPanel';
import { MapAnalyticsEngine } from '@/components/MapAnalyticsEngine';
import { VegetationIndex, VEGETATION_INDEX_CONFIG } from '@/lib/vegetation-indices';
import { useDrawingManager } from '@/hooks/useDrawingManager';
import { VectorizationToolbar } from './VectorizationToolbar';
import { AnnotationDialog } from './AnnotationDialog';
import { AnnotationContextMenu } from './AnnotationContextMenu';
import { DrawPlotsPanel } from './DrawPlotsPanel';
import { MeasurementTooltip } from './MeasurementTooltip';
import { ZonalStatsPanel } from './ZonalStatsPanel';
import { PixelInspectorTooltip } from './PixelInspectorTooltip';

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
  isAdmin?: boolean; // enables inline layer name/date editing
}

const MapboxGolfCourseMap = ({
  golfCourseId,
  mapboxAccessToken,
  baseStyle = 'mapbox://styles/mapbox/satellite-streets-v12',
  showControls = true,
  className = '',
  onMapReady,
  isAdmin = false,
}: MapboxGolfCourseMapProps) => {
  const t = useT();
  const wrapperRef = useRef<HTMLDivElement>(null);
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const [tilesets, setTilesets] = useState<GolfCourseTileset[]>([]);
  const [selectedLayers, setSelectedLayers] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentZoom, setCurrentZoom] = useState<number>(16);
  const [showVectorLabels, setShowVectorLabels] = useState(true);
  const geolocateControlRef = useRef<mapboxgl.GeolocateControl | null>(null);
  const [swipeMode, setSwipeMode] = useState(false);
  const [showHealthMaps, setShowHealthMaps] = useState(false);
  const [healthMapTilesets, setHealthMapTilesets] = useState<any[]>([]);
  const [selectedHealthMapIds, setSelectedHealthMapIds] = useState<string[]>([]);
  const [containerReady, setContainerReady] = useState(false);
  const [healthMapLoaded, setHealthMapLoaded] = useState(false);
  const [healthMapOpacity, setHealthMapOpacity] = useState(1);
  const [isAnimating, setIsAnimating] = useState(false);
  const animationRef = useRef<number | null>(null);
  const mapInitializedRef = useRef(false);
  const [mapReady, setMapReady] = useState(false);
  // Tracks which COG key the current presigned URL was fetched for.
  // Prevents the analysis effect from resetting mode/URL on every layerOrder shuffle.
  const activeCogKeyRef = useRef<string | null>(null);
  // Tracks the currently loaded RGB tileset so we don't reset the user's
  // analysis index/range/bandMapping every time layerOrder shuffles for an
  // unrelated reason (vector layer arrival, health map load, drag reorder).
  const activeRgbTilesetIdRef = useRef<string | null>(null);

  // Vectorization & Drawing Tools
  const drawing = useDrawingManager(map.current, Number(golfCourseId) || null, mapReady, golfCourseId);
  
  // Vector layer states
  const [vectorLayers, setVectorLayers] = useState<VectorLayer[]>([]);
  const [visibleVectorLayers, setVisibleVectorLayers] = useState<Set<string>>(new Set());
  const [showVectorLayerPanel, setShowVectorLayerPanel] = useState(false);
  const [vectorLayersAboveHealth, setVectorLayersAboveHealth] = useState(true);

  // Analysis Panel States
  const [analysisModeEnabled, setAnalysisModeEnabled] = useState(false);
  const [analysisIndex, setAnalysisIndex] = useState<VegetationIndex>('RGB_VARI');
  const [analysisRange, setAnalysisRange] = useState<[number, number]>([-0.5, 0.5]);
  const [analysisModeMap, setAnalysisModeMap] = useState<'RGB' | 'Multispectral' | 'None'>('None');
  const [analysisTileUrl, setAnalysisTileUrl] = useState<string | null>(null);
  // Bounds [west, south, east, north] of the active tileset — used by MapAnalyticsEngine for RGB histogram
  const [analysisTileBounds, setAnalysisTileBounds] = useState<[number, number, number, number] | undefined>(undefined);
  const [analysisTileMinZoom, setAnalysisTileMinZoom] = useState<number>(14);
  const [analysisHistogramData, setAnalysisHistogramData] = useState<Array<{ value: number; count: number }>>([]);
  const [bandMapping, setBandMapping] = useState({ r: 0, g: 1, b: 2, nir: 2, re: 3 }); // NIR=Band 3, RedEdge=Band 4

  // Zonal Stats + Pixel Inspector state
  const [showZonalStats, setShowZonalStats] = useState(false);
  const [isPixelInspectorActive, setIsPixelInspectorActive] = useState(false);

  // When the user picks a new index, reset the range to that index's theoretical domain
  // so stale values from the previous index don't persist in the slider labels.
  const handleSelectIndex = useCallback((index: VegetationIndex) => {
    setAnalysisIndex(index);
    const cfg = VEGETATION_INDEX_CONFIG[index];
    if (cfg) setAnalysisRange([cfg.domain[0], cfg.domain[1]]);
  }, []);

  // Map of content_files.id → original_filename for raster display names
  const [rasterFileNames, setRasterFileNames] = useState<Record<string, string>>({});
  
  // Raster layer control - always shown by default
  const [showRasterLayers, setShowRasterLayers] = useState(true);
  const [rasterOpacity, setRasterOpacity] = useState(1);
  const rasterLoadingRef = useRef(false);
  const [rasterLayersLoaded, setRasterLayersLoaded] = useState(false);
  
  // Layer swipe control
  const [swipeEnabled, setSwipeEnabled] = useState(false);
  const [swipeLeftLayerId, setSwipeLeftLayerId] = useState<string | null>(null);
  const [swipeRightLayerId, setSwipeRightLayerId] = useState<string | null>(null);

  // Unified ordered layer list (for drag-and-drop reordering)
  const [layerOrder, setLayerOrder] = useState<string[]>([]);

  // Synchronize layerOrder with available layers (add new, remove deleted)
  useEffect(() => {
    setLayerOrder(prev => {
      const allPossibleIds = new Set([
        ...tilesets.map(t => `tileset-layer-${t.id}`),
        ...healthMapTilesets.map(h => `health-map-layer-${h.id}`),
        ...vectorLayers.map(v => `vector-layer-${v.id}`)
      ]);
      const filtered = prev.filter(id => allPossibleIds.has(id));
      const existingSet = new Set(filtered);
      const toAdd = Array.from(allPossibleIds).filter(id => !existingSet.has(id));
      return [...toAdd, ...filtered];
    });
  }, [tilesets, healthMapTilesets, vectorLayers]);

  // Stable function to sync Mapbox z-index to drag order
  // Helper: check if a tileset ID belongs to a COG (skip from Mapbox layer order)
  const isCogTilesetId = useCallback((tilesetId: string) => {
    const ts = tilesets.find(t => t.id === tilesetId);
    return ts ? (ts.format === 'cog' || !!(ts as any).cog_source_key) : false;
  }, [tilesets]);

  const syncLayerOrder = useCallback(() => {
    if (!map.current || !map.current.isStyleLoaded() || layerOrder.length === 0) return;

    const applyLayerState = (id: string, isVisible: boolean, beforeId?: string) => {
      if (!map.current!.getLayer(id)) return;
      try {
        if (beforeId && map.current!.getLayer(beforeId)) {
          map.current!.moveLayer(id, beforeId);
        } else {
          map.current!.moveLayer(id);
        }
        const currentVisibility = map.current!.getLayoutProperty(id, 'visibility') || 'visible';
        const targetVisibility = isVisible ? 'visible' : 'none';
        if (currentVisibility !== targetVisibility) {
          map.current!.setLayoutProperty(id, 'visibility', targetVisibility);
        }
      } catch (e) {
        console.warn(`Failed to move/show layer ${id}:`, e);
      }
    };

    // ── Pass 0: Pin raster tileset layers (RGB orthomosaic) just below the raster ceiling ──
    // Forward iteration so layerOrder[0] (bottom) ends up lowest in the raster group.
    // These stay below the COG/Deck.GL layers which are anchored above the ceiling via beforeId.
    layerOrder.forEach(layerId => {
      if (!layerId.startsWith('tileset-layer-')) return;
      const rawId = layerId.replace('tileset-layer-', '');
      if (isCogTilesetId(rawId)) return; // COG tilesets live in Deck.GL — no Mapbox layer
      if (!map.current!.getLayer(layerId)) return;
      // While swipe is active, the left-map visibility is owned by
      // applySwipeVisibility — skip this pass so we don't fight it.
      if (swipeEnabled) return;
      const shouldBeVisible = showRasterLayers && selectedLayers.includes(rawId);
      applyLayerState(layerId, shouldBeVisible, 'raster-tileset-ceiling');
    });

    // ── Pass 1: Reorder health maps and vector layers (reverse so layerOrder[0] = bottom) ──
    // Mapbox moveLayer without beforeId puts the layer at the TOP of the current stack.
    const reversedOrder = [...layerOrder].reverse();
    reversedOrder.forEach(layerId => {
      if (layerId.startsWith('tileset-layer-')) return; // handled in pass 0

      if (map.current!.getLayer(layerId)) {
        const isHealth = layerId.startsWith('health-map-layer-');
        const isVector = layerId.startsWith('vector-layer-');
        const rawId = layerId.replace('health-map-layer-', '').replace('vector-layer-', '');

        let shouldBeVisible = false;
        if (isHealth) shouldBeVisible = showHealthMaps && selectedHealthMapIds.includes(rawId);
        if (isVector) shouldBeVisible = visibleVectorLayers.has(rawId);

        if (isVector) {
          // Visibility is managed by syncVectorVisibility; just maintain z-order here.
          // Labels are hoisted in the second pass below.
          const layerIds = [layerId, `${layerId}-outline`, `${layerId}-line`, `${layerId}-point`];
          layerIds.forEach(id => {
            if (map.current!.getLayer(id)) {
              try { map.current!.moveLayer(id); } catch(e) {}
            }
          });
        } else if (isHealth) {
          // Skip visibility while swipe owns it; still maintain z-order.
          if (swipeEnabled) {
            try { map.current!.moveLayer(layerId); } catch(e) {}
          } else {
            applyLayerState(layerId, shouldBeVisible);
          }
        }
      }
    });

    // ── Second pass: always float ALL vector label layers above raster/health layers ──
    [...layerOrder].reverse().forEach(layerId => {
      if (!layerId.startsWith('vector-layer-')) return;
      const labelId = `${layerId}-label`;
      if (map.current!.getLayer(labelId)) {
        try { map.current!.moveLayer(labelId); } catch(e) {}
      }
    });

    // ── Third pass: hoist drawing/annotation/handle layers to the very top ──
    // This ensures they always render above any raster ortho-mosaic or health-map layer.
    const annotationDrawingLayers = [
      'drawing-fill', 'drawing-line', 'drawing-points', 'drawing-grid-fill', 'drawing-grid-line',
      'annotations-fill', 'annotations-line', 'annotations-points', 'annotations-labels',
      'edit-handles-vertex', 'edit-handles-scale', 'edit-handles-scale-icon',
      'edit-handles-rotate-line', 'edit-handles-rotate', 'edit-handles-rotate-icon',
    ];
    annotationDrawingLayers.forEach(id => {
      if (map.current!.getLayer(id)) {
        try { map.current!.moveLayer(id); } catch(e) {}
      }
    });

  }, [layerOrder, selectedLayers, selectedHealthMapIds, visibleVectorLayers, showRasterLayers, showHealthMaps, swipeEnabled]);

  // Sync Mapbox z-index whenever order or selection changes.
  // If the style isn't loaded yet, syncLayerOrder bails — we register a one-shot
  // 'idle' listener to retry once. Previously this attached a permanent listener
  // that re-ran on every pan/zoom, doing redundant work and spamming the console.
  useEffect(() => {
    if (!map.current) return;

    if (map.current.isStyleLoaded()) {
      syncLayerOrder();
      return;
    }

    const onIdleOnce = () => syncLayerOrder();
    map.current.once('idle', onIdleOnce);
    return () => {
      map.current?.off('idle', onIdleOnce);
    };
  }, [syncLayerOrder, rasterLayersLoaded, healthMapLoaded]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  mapboxgl.accessToken = mapboxAccessToken;

  const setMapContainerRef = useCallback((node: HTMLDivElement | null) => {
    if (node && !mapContainer.current) {
      mapContainer.current = node;
      setContainerReady(true);
    }
  }, []);

  // Load all tilesets for the golf club
  useEffect(() => {
    const loadTilesets = async () => {
      setIsLoading(true);
      setError(null);

      // Clear state from the previous course so orphan IDs from another course
      // don't linger in selection/visibility sets while new data is fetched.
      // visibleVectorLayers is pruned by fetchVectorLayers itself.
      setSelectedLayers([]);
      setSelectedHealthMapIds([]);
      setHealthMapTilesets([]);
      setRasterFileNames({});

      try {
        const tilesetsData = await TilesetService.getTilesetsForGolfClub(golfCourseId);

        setTilesets(tilesetsData || []);
        if (tilesetsData && tilesetsData.length > 0) {
          setSelectedLayers([tilesetsData[0].id]);
        }

        // Fetch original filenames from content_files for proper layer display names.
        // Wrapped in its own try/catch: if the table is inaccessible (RLS, etc.)
        // the map still loads — display names just fall back to tileset.name.
        try {
          const sourceFileIds = (tilesetsData || [])
            .map((t: any) => t.source_file_id)
            .filter(Boolean) as string[];
          if (sourceFileIds.length > 0) {
            const { data: contentFiles, error: cfError } = await (supabase as any)
              .from('content_files')
              .select('id, original_filename, filename')
              .in('id', sourceFileIds);
            if (cfError) {
              console.warn('Could not load layer display names (non-fatal):', cfError);
            } else if (contentFiles) {
              const namesMap: Record<string, string> = {};
              contentFiles.forEach((cf: any) => {
                namesMap[cf.id] = cf.original_filename || cf.filename || '';
              });
              setRasterFileNames(namesMap);
            }
          }
        } catch (nameErr) {
          console.warn('Could not load layer display names (non-fatal):', nameErr);
        }

        const { data: healthMaps, error: healthError } = await (supabase as any)
          .from('health_map_tilesets')
          .select('*')
          .eq('golf_course_id', golfCourseId)
          .eq('is_active', true)
          .order('analysis_date', { ascending: false })
          .order('analysis_time', { ascending: false });

        if (healthError) {
          console.error('Error loading health maps:', healthError);
        } else if (healthMaps) {
          setHealthMapTilesets(healthMaps || []);
        }
        
      } catch (err) {
        console.error('Failed to load tilesets:', err);
        setError('Failed to load map data');
      } finally {
        setIsLoading(false);
      }
    };

    const fetchVectorLayers = async () => {
      const { data: vectorLayersData, error: vectorError } = await (supabase as any)
        .from('vector_layers')
        .select('*')
        .eq('golf_course_id', golfCourseId)
        .eq('is_active', true)
        .order('z_index', { ascending: true });

      if (vectorError) {
        console.error('Error loading vector layers:', vectorError);
      } else if (vectorLayersData && vectorLayersData.length > 0) {
        setVectorLayers(vectorLayersData);
        
        // When dynamically fetching layers, don't brutally reset visible layers if some already existed
        setVisibleVectorLayers(prev => {
           if (prev.size === 0 && !mapInitializedRef.current) return new Set();
           const next = new Set(prev);
           // Keep only still active ones
           for (const p of Array.from(prev)) {
               if (!vectorLayersData.find((v: any) => v.id === p)) {
                   next.delete(p);
               }
           }
           return next;
        });
      } else {
        setVectorLayers([]);
      }
    };

    loadTilesets();
    fetchVectorLayers();
    
    // Subscribe to realtime changes on vector_layers table
    const channel = supabase.channel('vector_layers_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'vector_layers',
          filter: `golf_course_id=eq.${golfCourseId}`
        },
        () => {
          fetchVectorLayers();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [golfCourseId]);

  // Initialize map
  useEffect(() => {
    if (mapInitializedRef.current) return;
    if (!mapContainer.current || map.current) return;

    mapInitializedRef.current = true;

    // Default center (Netherlands/world center), overridden if we have a tileset
    let initialCenter: [number, number] = [5.2913, 52.1326]; // Netherlands
    let initialZoom = 7;
    let initialMinZoom = 0;
    let initialMaxZoom = 22;
    let useBounds = false;
    let boundsCoords: [[number, number], [number, number]] | undefined = undefined;

    const primaryTileset = tilesets.length > 0 ? tilesets[0] : null;

    if (primaryTileset) {
      // Validate that coordinates are in valid WGS84 range
      const validLat = (v: number) => typeof v === 'number' && isFinite(v) && v >= -90 && v <= 90;
      const validLon = (v: number) => typeof v === 'number' && isFinite(v) && v >= -180 && v <= 180;

      if (
        validLon(primaryTileset.center_lon) &&
        validLat(primaryTileset.center_lat) &&
        validLon(primaryTileset.min_lon) && validLon(primaryTileset.max_lon) &&
        validLat(primaryTileset.min_lat) && validLat(primaryTileset.max_lat)
      ) {
        initialCenter = [primaryTileset.center_lon, primaryTileset.center_lat];
        initialZoom = primaryTileset.default_zoom;
        initialMinZoom = primaryTileset.min_zoom;
        // Do NOT clamp the map's max view zoom to the tileset's processing boundaries.
        // Allow the user to "over-zoom" deeply into the pixels (up to zoom 24).
        initialMaxZoom = 24;
        useBounds = true;
        boundsCoords = [
          [primaryTileset.min_lon, primaryTileset.min_lat],
          [primaryTileset.max_lon, primaryTileset.max_lat]
        ];
      } else {
        console.warn('Tileset has invalid coordinates, using default center:', {
          center_lat: primaryTileset.center_lat,
          center_lon: primaryTileset.center_lon,
        });
      }
    }

    try {
      map.current = new mapboxgl.Map({
        container: mapContainer.current,
        style: baseStyle,
        center: initialCenter,
        zoom: initialZoom,
        minZoom: initialMinZoom,
        maxZoom: initialMaxZoom,
        ...(useBounds && boundsCoords ? {
          bounds: boundsCoords,
          fitBoundsOptions: { padding: 50 }
        } : {})
      });

      if (showControls) {
        // Scale bar – bottom-right
        map.current.addControl(
          new mapboxgl.ScaleControl({ maxWidth: 100, unit: 'metric' }),
          'bottom-right'
        );
        // North arrow / compass – bottom-right, compass only
        map.current.addControl(
          new mapboxgl.NavigationControl({ 
            showCompass: true, 
            showZoom: false,
            visualizePitch: true 
          }),
          'bottom-right'
        );
      }


      map.current.on('zoom', () => {
        if (map.current) {
          setCurrentZoom(Math.round(map.current.getZoom()));
        }
      });

      map.current.on('load', async () => {
        setMapReady(true);

        if (!map.current!.getLayer('dynamic-layers-anchor')) {
          const firstLayerId = map.current!.getStyle().layers?.[0]?.id;
          map.current!.addLayer({
            id: 'dynamic-layers-anchor',
            type: 'background',
            layout: { visibility: 'none' }
          }, firstLayerId);
        }

        // Sentinel 1: raster tileset layers (RGB orthomosaic) are anchored just below this.
        // Keeps them above the basemap but below the COG/vegetation-index rendering.
        if (!map.current!.getLayer('raster-tileset-ceiling')) {
          map.current!.addLayer({
            id: 'raster-tileset-ceiling',
            type: 'background',
            paint: { 'background-opacity': 0 }
          });
        }

        // Sentinel 2: Deck.GL COG layers (NDVI, vegetation indices) are anchored just below
        // this via beforeId:'cog-deck-insert-point'. Sits above raster-tileset-ceiling so
        // vegetation index overlays render on top of the RGB orthomosaic.
        if (!map.current!.getLayer('cog-deck-insert-point')) {
          map.current!.addLayer({
            id: 'cog-deck-insert-point',
            type: 'background',
            paint: { 'background-opacity': 0 }
          });
        }
        
        if (onMapReady && map.current) {
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

  // Auto-enable layers selected in the swipe tool so they exist on the main map
  useEffect(() => {
    if (!swipeEnabled) return;
    
    const forceEnableLayer = (layerId: string | null) => {
      if (!layerId) return;
      if (layerId.startsWith('tileset-layer-')) {
        const id = layerId.replace('tileset-layer-', '');
        setSelectedLayers(prev => prev.includes(id) ? prev : [...prev, id]);
      } else if (layerId.startsWith('health-map-layer-')) {
        const id = layerId.replace('health-map-layer-', '');
        setSelectedHealthMapIds(prev => prev.includes(id) ? prev : [...prev, id]);
        setShowHealthMaps(true);
      }
      // Vector layers are intentionally excluded from swipe — see swipeOptions.
    };
    
    forceEnableLayer(swipeLeftLayerId);
    forceEnableLayer(swipeRightLayerId);
  }, [swipeEnabled, swipeLeftLayerId, swipeRightLayerId]);

  // While swipe is active, the LEFT pane (main map) shows ONLY swipeLeftLayerId.
  // Mirrors what DualMapSwipe does for the right pane via the same helper.
  // Restoration on swipe-exit happens automatically: syncLayerOrder and
  // syncVectorVisibility both depend on `swipeEnabled` and re-run when it flips.
  useEffect(() => {
    if (!swipeEnabled || !map.current) return;

    const m = map.current;
    const apply = () => applySwipeVisibility(m, swipeLeftLayerId);

    apply();
    // Re-apply on idle so layers added late (e.g. just after force-enable) get gated.
    const onIdle = () => apply();
    m.on('idle', onIdle);
    return () => {
      m.off('idle', onIdle);
    };
  }, [swipeEnabled, swipeLeftLayerId, selectedLayers, selectedHealthMapIds]);

  // Load, show, and hide raster layers dynamically
  useEffect(() => {
    if (!map.current) {
      return;
    }

    if (!mapReady || !map.current.isStyleLoaded()) return;

    // If toggle is OFF, securely remove all raster layers
    if (!showRasterLayers) {
      tilesets.forEach(tileset => {
        const layerId = `tileset-layer-${tileset.id}`;
        const sourceId = `tileset-source-${tileset.id}`;
        
        if (map.current!.getLayer(layerId)) {
          map.current!.removeLayer(layerId);
        }
        if (map.current!.getSource(sourceId)) {
          map.current!.removeSource(sourceId);
        }
      });
      setRasterLayersLoaded(false);
      return;
    }

    // If ON, add selected and remove unselected
    const loadSelectedRasters = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;

      // 1. Remove layers that are no longer selected
      tilesets.forEach(tileset => {
        if (!selectedLayers.includes(tileset.id)) {
          const layerId = `tileset-layer-${tileset.id}`;
          const sourceId = `tileset-source-${tileset.id}`;
          if (map.current!.getLayer(layerId)) {
            map.current!.removeLayer(layerId);
          }
          if (map.current!.getSource(sourceId)) {
            map.current!.removeSource(sourceId);
          }
        }
      });

      // 2. Add or update selected layers
      selectedLayers.forEach((tilesetId) => {
        const tileset = tilesets.find(t => t.id === tilesetId);
        if (!tileset) {
          console.warn(`⚠️ Tileset ID ${tilesetId} not found in tilesets list`);
          return;
        }

        // COG tilesets render via Deck.GL (byte-range streaming), NOT via tile-proxy.
        // Skip adding a Mapbox raster source/layer for them — it would 404 and spam warnings.
        const isCogTileset = tileset.format === 'cog' || !!(tileset as any).cog_source_key;
        if (isCogTileset) return;

        const sourceId = `tileset-source-${tileset.id}`;
        const layerId = `tileset-layer-${tileset.id}`;
        const tileUrlTemplate = `${supabaseUrl}/functions/v1/tile-proxy/${encodeURIComponent(tileset.id)}/{z}/{x}/{y}.png`;

        // Add source if it doesn't exist
        if (!map.current!.getSource(sourceId)) {
          map.current!.addSource(sourceId, {
            type: 'raster',
            tiles: [tileUrlTemplate],
            tileSize: 256,
            minzoom: tileset.min_zoom,
            maxzoom: tileset.max_zoom,
            bounds: [
              tileset.min_lon,
              tileset.min_lat,
              tileset.max_lon,
              tileset.max_lat
            ]
          });
        }

        // Add layer if it doesn't exist (SEPARATE from source check — source may exist but layer may be missing)
        if (!map.current!.getLayer(layerId)) {
          // Insert below the raster ceiling sentinel so the initial position is
          // correct before syncLayerOrder runs (otherwise Mapbox places it on top).
          const beforeId = map.current!.getLayer('raster-tileset-ceiling') ? 'raster-tileset-ceiling' : undefined;
          map.current!.addLayer({
            id: layerId,
            type: 'raster',
            source: sourceId,
            layout: { visibility: 'visible' },
            paint: {
              'raster-opacity': rasterOpacity
            }
          }, beforeId);
        } else {
          map.current!.setLayoutProperty(layerId, 'visibility', 'visible');
        }
      });

      setRasterLayersLoaded(true);
      // Immediately trigger reorder after adding new layers
      setTimeout(syncLayerOrder, 100); 
    };

    loadSelectedRasters();
  }, [showRasterLayers, selectedLayers, tilesets, mapReady, syncLayerOrder]);

  // Sync Analysis engine mode based on the topmost VISIBLE raster layer in draw order.
  // Draw order is maintained by `layerOrder` (index 0 = top).
  // When multiple layers are visible, the topmost one determines whether the
  // AnalysisPanel shows RGB or Multispectral vegetation indices.
  useEffect(() => {
    // Walk layerOrder from top (index 0) → bottom to find first visible raster tileset
    let topmostTileset: GolfCourseTileset | null = null;

    for (const layerId of layerOrder) {
      // Only tileset-layers drive analysis mode (health maps are pre-rendered,
      // vector layers have no pixel data for vegetation index computation)
      if (!layerId.startsWith('tileset-layer-')) continue;

      const rawId = layerId.replace('tileset-layer-', '');
      // Must be both selected AND raster visibility is on
      if (!showRasterLayers || !selectedLayers.includes(rawId)) continue;

      const ts = tilesets.find(t => t.id === rawId);
      if (ts) {
        topmostTileset = ts;
        break;
      }
    }

    if (!topmostTileset) {
      activeCogKeyRef.current = null;
      activeRgbTilesetIdRef.current = null;
      setAnalysisModeMap('None');
      setAnalysisTileUrl(null);
      setAnalysisTileBounds(undefined);
      // Do NOT touch analysisModeEnabled here. The user's toggle preference must
      // survive the brief moment when selectedLayers is empty between switching
      // layers (turn Layer A off → turn Layer B on). The overlay is already
      // suppressed by mode='None' in MapAnalyticsEngine.
      return;
    }

    const isCog = topmostTileset.format === 'cog' || !!(topmostTileset as any).cog_source_key;
    const cogKey = (topmostTileset as any).cog_source_key as string | undefined;
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;

    if (isCog && cogKey) {
      // Pathway B: Multispectral COG — get a long-lived presigned R2 URL.
      // Guard: if this exact COG key is already loaded/loading, just ensure
      // analysis is enabled and leave the existing URL/mode untouched.
      // This prevents every layerOrder shuffle (as tilesets/vectorLayers/healthMaps
      // arrive at different times) from resetting mode→'None' and blanking the overlay.
      activeRgbTilesetIdRef.current = null;
      setAnalysisModeEnabled(true);
      if (cogKey !== activeCogKeyRef.current) {
        activeCogKeyRef.current = cogKey;
        setAnalysisModeMap('None');
        setAnalysisTileUrl(null);
        setAnalysisTileBounds(undefined);
        setAnalysisIndex('MS_NDVI');
        setAnalysisRange([-1, 1]);
        setBandMapping({ r: 0, g: 1, b: 2, nir: 2, re: 3 });
        import('@/lib/r2Service').then(({ R2Service }) => {
          R2Service.getGetUrl(cogKey, 4 * 3600)
            .then(({ url }) => {
              if (activeCogKeyRef.current !== cogKey) return; // superseded
              setAnalysisModeMap('Multispectral');
              setAnalysisTileUrl(url);
            })
            .catch(err => {
              console.error('[COG] Failed to get presigned URL:', err);
              if (activeCogKeyRef.current === cogKey) {
                setAnalysisTileUrl(null);
                setAnalysisModeEnabled(false);
              }
            });
        });
      }
    } else {
      // Pathway A: Standard RGB PNG tiles — route through tile-proxy.
      // Symmetric guard with the COG path: only reset analysis settings when
      // switching to a *different* RGB tileset. Otherwise unrelated layerOrder
      // shuffles would clobber the user's chosen index/range every time.
      activeCogKeyRef.current = null;
      setAnalysisModeEnabled(true);
      setAnalysisTileUrl(`${supabaseUrl}/functions/v1/tile-proxy/${encodeURIComponent(topmostTileset.id)}/{z}/{x}/{y}.png`);
      setAnalysisTileBounds([topmostTileset.min_lon, topmostTileset.min_lat, topmostTileset.max_lon, topmostTileset.max_lat]);
      setAnalysisTileMinZoom(topmostTileset.min_zoom);
      if (topmostTileset.id !== activeRgbTilesetIdRef.current) {
        activeRgbTilesetIdRef.current = topmostTileset.id;
        setAnalysisModeMap('RGB');
        setAnalysisIndex('RGB_VARI');
        setAnalysisRange([-0.5, 0.5]);
        setBandMapping({ r: 0, g: 1, b: 2, nir: 0, re: 0 }); // RGB: R(B1), G(B2), B(B3)
      }
    }
  }, [selectedLayers, tilesets, layerOrder, showRasterLayers]);



  // Update raster opacity dynamically
  useEffect(() => {
    if (!map.current) return;
    selectedLayers.forEach(tilesetId => {
      const layerId = `tileset-layer-${tilesetId}`;
      if (map.current!.getLayer(layerId)) {
        try {
          map.current!.setPaintProperty(layerId, 'raster-opacity', rasterOpacity);
        } catch (e) {
          console.warn(`Could not set opacity for ${layerId}:`, e);
        }
      }
    });
  }, [rasterOpacity, selectedLayers]);

  // Update health map opacity dynamically. Skipped while a swipe animation is
  // running so it doesn't fight the per-frame setPaintProperty calls in animateSwipe.
  useEffect(() => {
    if (!map.current || isAnimating) return;
    selectedHealthMapIds.forEach(id => {
      const layerId = `health-map-layer-${id}`;
      if (map.current!.getLayer(layerId)) {
        try {
          map.current!.setPaintProperty(layerId, 'raster-opacity', healthMapOpacity);
        } catch (e) {
          console.warn(`Could not set opacity for ${layerId}:`, e);
        }
      }
    });
  }, [healthMapOpacity, selectedHealthMapIds, isAnimating]);

  // FIX 3: Handle health map toggle - REMOVE layers when toggling off
  useEffect(() => {
    if (!map.current) return;
    if (!mapReady || !map.current.isStyleLoaded()) return;

    // If toggling off, remove all health map layers (not just hide)
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
              // Insert above the raster ceiling but below the COG insert point so
              // health maps stack above orthomosaics yet under vegetation indices.
              const beforeId = map.current!.getLayer('cog-deck-insert-point') ? 'cog-deck-insert-point' : undefined;
              map.current!.addLayer({
                id: layerId,
                type: 'raster',
                source: sourceId,
                paint: {
                  'raster-opacity': healthMapOpacity
                }
              }, beforeId);
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
        // Immediately trigger reorder after adding new health maps
        setTimeout(syncLayerOrder, 100);
      })();
    }
  }, [showHealthMaps, selectedHealthMapIds, healthMapTilesets, rasterLayersLoaded, syncLayerOrder]);


  // A ref to guard against concurrent preloads
  const vectorPreloadRunningRef = useRef(false);
  const vectorLayersLengthRef = useRef(0);

  // Reset the preload guard whenever the list of vector layers changes,
  // so newly uploaded layers get properly preloaded.
  useEffect(() => {
    if (vectorLayers.length !== vectorLayersLengthRef.current) {
      vectorLayersLengthRef.current = vectorLayers.length;
      vectorPreloadRunningRef.current = false;
    }
  }, [vectorLayers.length]);

  // VISIBILITY: Synchronously flip visibility when visibleVectorLayers state changes.
  // Defined here (before preload effect) so preloadAll() can call it without a stale closure.
  const syncVectorVisibility = useCallback(() => {
    if (!map.current || !map.current.isStyleLoaded()) return;

    vectorLayers.forEach(layer => {
      const vid = `vector-layer-${layer.id}`;
      const ids = [vid, `${vid}-outline`, `${vid}-line`, `${vid}-point`];
      // Swipe is raster-only — every vector layer is force-hidden while it's active.
      const visibility = swipeEnabled
        ? 'none'
        : (visibleVectorLayers.has(layer.id) ? 'visible' : 'none');

      ids.forEach(id => {
        if (map.current!.getLayer(id)) {
          map.current!.setLayoutProperty(id, 'visibility', visibility);
        }
      });

      const labelId = `${vid}-label`;
      const labelVisibility = (!swipeEnabled && visibleVectorLayers.has(layer.id) && showVectorLabels)
        ? 'visible'
        : 'none';
      if (map.current!.getLayer(labelId)) {
        map.current!.setLayoutProperty(labelId, 'visibility', labelVisibility);
      }
    });

    // Sync drawing-manager annotation layers (allowlist approach).
    // A published annotation is shown ONLY if its `published_layer_name` matches a
    // currently-visible vector layer. Annotations without `published_layer_name`
    // are true drafts (in-progress drawings) and always render.
    //
    // Allowlist (not denylist) is critical: on initial load `vectorLayers` may be
    // [] before Supabase responds. With a denylist, an empty hidden-list meant
    // *no filter*, leaking every published annotation onto the map until the user
    // clicked something. With an allowlist, an empty visible-list correctly hides
    // all published annotations.
    // While swipe is active, suppress every published annotation too — swipe is
    // raster-only, and annotations belong to the vector overlay family.
    const visibleLayerNames: string[] = swipeEnabled
      ? []
      : vectorLayers
          .filter(l => visibleVectorLayers.has(l.id))
          .map(l => l.name);

    const m = map.current!;

    const allowClause: any[] = ['any',
      ['!', ['has', 'published_layer_name']],
      ['==', ['get', 'published_layer_name'], ''],
      ['in', ['get', 'published_layer_name'], ['literal', visibleLayerNames]]
    ];

    const withVisibility = (baseFilter: any[]) =>
      ['all', baseFilter, allowClause];

    if (m.getLayer('annotations-fill'))
      m.setFilter('annotations-fill',   withVisibility(['==', ['geometry-type'], 'Polygon']));
    if (m.getLayer('annotations-line'))
      m.setFilter('annotations-line',   withVisibility(['match', ['geometry-type'], ['LineString', 'Polygon'], true, false]));
    if (m.getLayer('annotations-points'))
      m.setFilter('annotations-points', withVisibility(['==', ['geometry-type'], 'Point']));
    if (m.getLayer('annotations-labels'))
      m.setFilter('annotations-labels', withVisibility(['has', 'plot_id']));
  }, [vectorLayers, visibleVectorLayers, showVectorLabels, mapReady, swipeEnabled]);

  useEffect(() => {
    syncVectorVisibility();
  }, [syncVectorVisibility]);

  // Always keep a ref to the latest syncVectorVisibility so async code
  // (preloadAll, map.on('load') callbacks) can call it without stale closures.
  const syncVectorVisibilityRef = useRef(syncVectorVisibility);
  useEffect(() => { syncVectorVisibilityRef.current = syncVectorVisibility; }, [syncVectorVisibility]);

  // Re-apply annotation filters once the map is ready. We must run this even
  // when `vectorLayers` is still empty: the drawing-manager adds annotation
  // layers with permissive default filters, so until syncVectorVisibility runs
  // every annotation in the source is rendered. With the allowlist filter, an
  // empty vectorLayers list correctly hides all *published* annotations and
  // shows only true drafts.
  //
  // Schedule a few retries to win the race against:
  //   - useDrawingManager adding annotation layers after mapReady flips true
  //   - fetchVectorLayers resolving from Supabase
  //   - syncLayerOrder needing the style to be fully loaded
  useEffect(() => {
    if (!mapReady) return;
    const run = () => {
      syncVectorVisibilityRef.current?.();
      syncLayerOrder();
    };
    run();
    const t1 = setTimeout(run, 100);
    const t2 = setTimeout(run, 400);
    const t3 = setTimeout(run, 1000);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapReady, vectorLayers.length, tilesets.length, selectedLayers.join(',')]);

  // PRELOAD: Load ALL vector layers onto the map once, all hidden.
  // Visibility toggling is then handled separately and synchronously.
  useEffect(() => {
    if (!map.current || !mapReady || !map.current.isStyleLoaded()) return;
    if (vectorLayers.length === 0) return;
    if (vectorPreloadRunningRef.current) return; // prevent re-entrant runs

    const r2PublicUrl = import.meta.env.VITE_R2_PUBLIC_URL;

    const preloadAll = async () => {
      vectorPreloadRunningRef.current = true;

      for (const layer of vectorLayers) {
        if (!map.current) break;

        const sourceId = `vector-source-${layer.id}`;
        const vectorLayerId = `vector-layer-${layer.id}`;

        // Already loaded — skip
        if (map.current.getSource(sourceId)) continue;

        try {
          let geojsonData;

          if (r2PublicUrl) {
            const response = await fetch(`${r2PublicUrl}/${layer.r2_key}`);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            geojsonData = await response.json();
          } else {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) throw new Error('No session');

            const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
            const response = await fetch(
              `${supabaseUrl}/functions/v1/get-vector-layers?golf_course_id=${golfCourseId}`,
              { headers: { 'Authorization': `Bearer ${session.access_token}`, 'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY } }
            );
            if (!response.ok) throw new Error('Failed to fetch layers');
            const result = await response.json();
            const layerData = result.data?.find((l: any) => l.id === layer.id);
            if (!layerData) throw new Error(`Layer not found`);
            const geoRes = await fetch(layerData.urlWithCache || layerData.url);
            if (!geoRes.ok) throw new Error('Failed to fetch GeoJSON');
            geojsonData = await geoRes.json();
          }

          if (!map.current) break;

          map.current.addSource(sourceId, { type: 'geojson', data: geojsonData });

          const layerColor = getLayerColor(layer.name);

          const layerDefs = [
            {
              id: vectorLayerId,
              type: 'fill' as const,
              source: sourceId,
              filter: ['in', ['geometry-type'], ['literal', ['Polygon', 'MultiPolygon']]],
              paint: { 'fill-color': layerColor, 'fill-opacity': 0.5 }
            },
            {
              id: `${vectorLayerId}-outline`,
              type: 'line' as const,
              source: sourceId,
              filter: ['in', ['geometry-type'], ['literal', ['Polygon', 'MultiPolygon']]],
              paint: { 'line-color': layerColor, 'line-width': 2 }
            },
            {
              id: `${vectorLayerId}-line`,
              type: 'line' as const,
              source: sourceId,
              filter: ['in', ['geometry-type'], ['literal', ['LineString', 'MultiLineString']]],
              paint: { 'line-color': layerColor, 'line-width': 3 }
            },
            {
              id: `${vectorLayerId}-point`,
              type: 'circle' as const,
              source: sourceId,
              filter: ['in', ['geometry-type'], ['literal', ['Point', 'MultiPoint']]],
              paint: { 'circle-radius': 6, 'circle-color': layerColor, 'circle-stroke-width': 2, 'circle-stroke-color': '#ffffff' }
            }
          ];

          // Label (symbol) layer – added separately to preserve full layout
          const labelLayer = {
            id: `${vectorLayerId}-label`,
            type: 'symbol' as const,
            source: sourceId,
            layout: {
              'visibility': 'none',
              'text-field': [
                'case',
                ['has', 'label'],
                ['get', 'label'],
                ['has', 'name'],
                ['get', 'name'],
                ['has', 'Name'],
                ['get', 'Name'],
                ['has', 'title'],
                ['get', 'title'],
                ['has', 'Title'],
                ['get', 'Title'],
                ['has', 'description'],
                ['get', 'description'],
                ['has', 'id'],
                ['to-string', ['get', 'id']],
                ['has', 'type'],
                ['get', 'type'],
                ''
              ],
              'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'],
              'text-size': 14,
              'text-anchor': 'center',
              'text-allow-overlap': true,
              'text-ignore-placement': true,
              'text-padding': 2
            } as any,
            paint: {
              'text-color': '#ffffff',
              'text-halo-color': '#000000',
              'text-halo-width': 3,
              'text-halo-blur': 0
            }
          };

          for (const def of layerDefs) {
            if (map.current && !map.current.getLayer(def.id)) {
              map.current.addLayer({
                ...def,
                layout: { ...(def.layout || {}), visibility: 'none' }
              } as any);
            }
          }

          // Add label layer separately so its full layout is preserved
          if (map.current && !map.current.getLayer(labelLayer.id)) {
            try {
              map.current.addLayer(labelLayer as any);
            } catch (err) {
              console.error(`❌ Failed to add label layer for ${layer.name}:`, err);
            }
          }

        } catch (err) {
          console.error(`❌ Failed to preload ${layer.name}:`, err);
        }
      }

      vectorPreloadRunningRef.current = false;

      // Use the ref so we always call the latest closure (vectorLayers/visibleVectorLayers
      // may have changed while preloadAll was running its async fetches).
      syncVectorVisibilityRef.current();
    };

    preloadAll();
  }, [mapReady, vectorLayers, golfCourseId]);


  // Health-map visibility (showHealthMaps) is independent of selection, mirroring
  // the raster-layer toggle. Deselecting all health maps no longer flips the toggle
  // off — re-selecting one renders immediately without the user re-enabling the toggle.

  // When swipe is enabled, pick a default left layer if none is selected
  useEffect(() => {
    if (!swipeEnabled) return;
    
    // Only auto-assign if `swipeLeftLayerId` is not already manually chosen
    if (swipeLeftLayerId && map.current?.getLayer(swipeLeftLayerId)) {
      return; 
    }

    let targetLayerId: string | null = null;
    
    if (showHealthMaps && selectedHealthMapIds.length > 0) {
      targetLayerId = `health-map-layer-${selectedHealthMapIds[selectedHealthMapIds.length - 1]}`;
    } else if (rasterLayersLoaded && selectedLayers.length > 0) {
      targetLayerId = `tileset-layer-${selectedLayers[0]}`;
    }

    if (targetLayerId) {
      setSwipeLeftLayerId(targetLayerId);
    }
  }, [swipeEnabled, showHealthMaps, selectedHealthMapIds, rasterLayersLoaded, selectedLayers]);



  // Helper: convert YYYY-MM-DD → DD/MM/YYYY for display
  const formatLayerDate = (dateStr: string): string => {
    const parts = dateStr.split('-');
    if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
    return dateStr;
  };

  // Helper: strip file extension (e.g. "NDVI.tif" → "NDVI")
  const stripExtension = (filename: string): string =>
    filename.replace(/\.[^.]+$/, '');

  // ── Admin: save edited layer name / date to Supabase ──────────────────────
  const handleLayerEdit = async (id: string, { name, date }: { name: string; date: string }) => {
    if (id.startsWith('tileset-layer-')) {
      const rawId = id.replace('tileset-layer-', '');
      const { error } = await (supabase as any)
        .from('golf_course_tilesets')
        .update({ name, flight_date: date || null })
        .eq('id', rawId);
      if (!error) {
        setTilesets(prev => prev.map(t => t.id === rawId ? { ...t, name, flight_date: date || null } : t));
      } else {
        console.error('Failed to update tileset name:', error);
      }
    } else if (id.startsWith('health-map-layer-')) {
      const rawId = id.replace('health-map-layer-', '');
      const { error } = await (supabase as any)
        .from('health_map_tilesets')
        .update({ analysis_type: name, analysis_date: date || null })
        .eq('id', rawId);
      if (!error) {
        setHealthMapTilesets(prev => prev.map(t =>
          t.id === rawId ? { ...t, analysis_type: name, analysis_date: date || null } : t
        ));
      } else {
        console.error('Failed to update health map name:', error);
      }
    } else if (id.startsWith('vector-layer-')) {
      const rawId = id.replace('vector-layer-', '');
      const { error } = await (supabase as any)
        .from('vector_layers')
        .update({ name })
        .eq('id', rawId);
      if (!error) {
        setVectorLayers(prev => prev.map(v => v.id === rawId ? { ...v, name } : v));
      } else {
        console.error('Failed to update vector layer name:', error);
      }
    }
  };

  const getLayerMetadata = (layerId: string | null) => {
    if (!layerId) return undefined;

    if (layerId.startsWith('health-map-layer-')) {
      const healthMapId = layerId.replace('health-map-layer-', '');
      const healthMap = healthMapTilesets.find(hm => hm.id === healthMapId);
      if (healthMap) {
        const baseName = healthMap.analysis_type
          ? healthMap.analysis_type.toUpperCase()
          : 'Health Map';
        const dateStr = healthMap.analysis_date ? formatLayerDate(healthMap.analysis_date) : '';
        const displayName = dateStr ? `${baseName}_ ${dateStr}` : baseName;
        return {
          name: displayName,
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
        const sourceFile = (tileset as any).source_file_id
          ? rasterFileNames[(tileset as any).source_file_id] || ''
          : '';
        const baseName = sourceFile ? stripExtension(sourceFile) : tileset.name;
        const dateStr = tileset.flight_date ? formatLayerDate(tileset.flight_date) : '';
        const displayName = dateStr ? `${baseName}_ ${dateStr}` : baseName;
        return {
          name: displayName,
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

  const centerOnCurrentLocation = () => {
    if (geolocateControlRef.current) {
      geolocateControlRef.current.trigger();
    } else if (navigator.geolocation && map.current) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          map.current?.flyTo({
            center: [position.coords.longitude, position.coords.latitude],
            zoom: 16,
            essential: true
          });
        },
        (error) => console.error("Error getting location", error),
        { enableHighAccuracy: true }
      );
    }
  };

  const [isFullscreen, setIsFullscreen] = useState(false);

  const toggleFullscreen = async () => {
    if (!isFullscreen) {
      if (wrapperRef.current?.requestFullscreen) {
        await wrapperRef.current.requestFullscreen().catch(err => {
          console.warn(`Fullscreen error: ${err.message}`);
        });
      }
    } else {
      if (document.exitFullscreen) {
        await document.exitFullscreen().catch(err => {
          console.warn(`Exit fullscreen error: ${err.message}`);
        });
      }
    }
  };

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
      // Ensure we resize the map after short layout shifts
      setTimeout(() => {
        if (map.current) map.current.resize();
      }, 100);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  if (isLoading) {
    return (
      <Card className={className}>
        <CardContent className="p-8 text-center">
          <div className="space-y-4">
            <div className="animate-spin w-16 h-16 border-2 border-primary border-t-transparent rounded-full mx-auto" />
            <h3 className="text-lg font-medium">{t.map.loadingMap}</h3>
            <p className="text-muted-foreground">{t.map.loadingMapDesc}</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className={className}>
        <CardContent className="p-8 text-center">
          <div className="space-y-4">
            <div className="w-16 h-16 mx-auto bg-destructive/10 rounded-full flex items-center justify-center">
              <AlertCircle className="w-8 h-8 text-destructive" />
            </div>
            <h3 className="text-lg font-medium">{t.map.mapNotAvailable}</h3>
            <p className="text-muted-foreground">
              {error || t.map.mapNotAvailableDesc}
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const canSwipe = selectedLayers.length === 2;

  // Build the unified list of all available layers for the Swipe Selector
  const getAllAvailableLayersForSwipe = () => {
    const options = [{ id: 'null', name: t.map.baseSatellite, type: 'base' }];
    
    if (rasterLayersLoaded) {
      selectedLayers.forEach(id => {
        const metadata = getLayerMetadata(`tileset-layer-${id}`);
        if (metadata) options.push({ id: `tileset-layer-${id}`, name: metadata.name, type: metadata.type });
      });
    }

    if (showHealthMaps) {
      selectedHealthMapIds.forEach(id => {
        const metadata = getLayerMetadata(`health-map-layer-${id}`);
        if (metadata) options.push({ id: `health-map-layer-${id}`, name: metadata.name, type: metadata.type });
      });
    }

    // Vector layers are intentionally omitted — swipe is raster-only.

    return options;
  };

  const swipeOptions = getAllAvailableLayersForSwipe();

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setLayerOrder((items) => {
        const oldIndex = items.indexOf(active.id as string);
        const newIndex = items.indexOf(over.id as string);
        return arrayMove(items, oldIndex, newIndex);
      });
    }
  };

  // Auto-generated name pattern written by the tile-geotiff workflow:
  // "CourseName - YYYY-MM-DD" — if name still matches, prefer the source filename.
  const isAutoGenName = (n: string) => /^.+ - \d{4}-\d{2}-\d{2}$/.test(n);


  const unifiedLayers = layerOrder.map(id => {
    if (id.startsWith('tileset-layer-')) {
      const rawId = id.replace('tileset-layer-', '');
      const layer = tilesets.find(t => t.id === rawId);
      if (!layer) return null;
      // Name priority: admin-set name > source filename > stored name
      const sourceFile = (layer as any).source_file_id
        ? rasterFileNames[(layer as any).source_file_id] || ''
        : '';
      const useSourceFile = isAutoGenName(layer.name) && sourceFile;
      const baseName = useSourceFile ? stripExtension(sourceFile) : layer.name;
      const editLabel = useSourceFile ? stripExtension(sourceFile) : layer.name;
      const dateStr = layer.flight_date ? formatLayerDate(layer.flight_date) : '';
      const displayName = dateStr ? `${baseName}_ ${dateStr}` : baseName;
      return {
        id, rawId, type: 'raster' as const,
        name: displayName,
        editLabel,
        editDate: layer.flight_date || '',
        isVisible: showRasterLayers && selectedLayers.includes(rawId),
      };
    }
    if (id.startsWith('health-map-layer-')) {
      const rawId = id.replace('health-map-layer-', '');
      const layer = healthMapTilesets.find(t => t.id === rawId);
      if (!layer) return null;
      const baseName = layer.analysis_type ? layer.analysis_type.toUpperCase() : 'Health Map';
      const dateStr = layer.analysis_date ? formatLayerDate(layer.analysis_date) : '';
      const displayName = dateStr ? `${baseName}_ ${dateStr}` : baseName;
      return {
        id, rawId, type: 'health' as const,
        name: displayName,
        editLabel: layer.analysis_type || '',
        editDate: layer.analysis_date || '',
        isVisible: showHealthMaps && selectedHealthMapIds.includes(rawId),
      };
    }
    if (id.startsWith('vector-layer-')) {
      const rawId = id.replace('vector-layer-', '');
      const layer = vectorLayers.find(t => t.id === rawId);
      if (!layer) return null;
      return {
        id, rawId, type: 'vector' as const,
        name: layer.name,
        editLabel: layer.name,
        editDate: '',
        isVisible: visibleVectorLayers.has(rawId),
        color: getLayerColor(layer.name),
      };
    }
    return null;
  }).filter(Boolean) as any[];

  const allLayersVisible = unifiedLayers.every(l => l.isVisible);
  const toggleAllUnifiedLayers = () => {
    if (allLayersVisible) {
      setShowRasterLayers(false);
      setSelectedLayers([]);
      setShowHealthMaps(false);
      setSelectedHealthMapIds([]);
      setVisibleVectorLayers(new Set());
    } else {
      setShowRasterLayers(true);
      setSelectedLayers(tilesets.map(t => t.id));
      setShowHealthMaps(true);
      setSelectedHealthMapIds(healthMapTilesets.map(h => h.id));
      setVisibleVectorLayers(new Set(vectorLayers.map(v => v.id)));
    }
  };

  const handleUnifiedLayerToggle = (id: string, isVisible: boolean) => {
    if (id.startsWith('tileset-layer-')) {
      const rawId = id.replace('tileset-layer-', '');
      if (isVisible) {
        if (!showRasterLayers) setShowRasterLayers(true);
        
        // Auto-fly to RGB Orthomosaic when toggled on
        const tileset = tilesets.find(t => t.id === rawId);
        const isCog = tileset ? (tileset.format === 'cog' || !!(tileset as any).cog_source_key) : false;
        
        // We only fly here for standard formats (RGB). Multispectral COG layers 
        // are handled dynamically by MapAnalyticsEngine once byte-data loads.
        if (tileset && !isCog && tileset.min_lon !== undefined && map.current) {
          map.current.fitBounds(
            [[tileset.min_lon, tileset.min_lat], [tileset.max_lon, tileset.max_lat]],
            { padding: 80, duration: 2000, maxZoom: 21 }
          );
        }
      }
      setSelectedLayers(prev => isVisible ? (prev.includes(rawId) ? prev : [...prev, rawId]) : prev.filter(x => x !== rawId));
    }
    else if (id.startsWith('health-map-layer-')) {
      const rawId = id.replace('health-map-layer-', '');
      if (isVisible && !showHealthMaps) setShowHealthMaps(true);
      setSelectedHealthMapIds(prev => isVisible ? (prev.includes(rawId) ? prev : [...prev, rawId]) : prev.filter(x => x !== rawId));
    }
    else if (id.startsWith('vector-layer-')) {
      const rawId = id.replace('vector-layer-', '');
      setVisibleVectorLayers(prev => {
        const next = new Set(prev);
        if (isVisible) next.add(rawId);
        else next.delete(rawId);
        return next;
      });
    }
  };


  return (
    <div
      className={`relative w-full ${isFullscreen ? 'fixed inset-0 z-[9999] h-screen bg-background text-foreground overflow-hidden touch-none' : 'h-[calc(100vh-140px)] min-h-[500px] border border-border rounded-lg bg-background overflow-hidden shadow-sm'}`}
      ref={wrapperRef}
      data-active-tool={isPixelInspectorActive ? 'inspect' : (drawing.activeTool ?? 'none')}
    >
        <div className="relative w-full h-full">
          {/* Main Map Container */}
          <div
            ref={setMapContainerRef}
            className="absolute inset-0 w-full h-full"
          />

          {/* Rubber-band selection rectangle */}
          {drawing.rubberBandRect && (
            <div
              style={{
                position: 'absolute',
                left: drawing.rubberBandRect.x,
                top: drawing.rubberBandRect.y,
                width: drawing.rubberBandRect.width,
                height: drawing.rubberBandRect.height,
                border: '1.5px dashed #00d2ff',
                backgroundColor: 'rgba(0, 210, 255, 0.08)',
                pointerEvents: 'none',
                zIndex: 10,
              }}
            />
          )}

          <AnnotationDialog 
            open={!!drawing.pendingAnnotation || !!drawing.editingAnnotation} 
            onOpenChange={(open) => {
              if (!open) {
                drawing.cancelDrawing();
                drawing.setEditingAnnotation(null);
              }
            }}
            pendingAnnotation={drawing.pendingAnnotation}
            existingAnnotation={drawing.editingAnnotation}
            onSave={async (data) => {
              if (drawing.editingAnnotation) {
                await drawing.updateAnnotationProperties(drawing.editingAnnotation.id, data);
                drawing.setEditingAnnotation(null);
              } else {
                drawing.savePendingAnnotation(data);
              }
            }}
          />

          <AnnotationContextMenu
            contextMenu={drawing.contextMenu}
            onClose={() => drawing.setContextMenu(null)}
            onEdit={(id) => {
              const ann = drawing.annotations.find(a => a.id === id);
              if (ann) drawing.setEditingAnnotation(ann);
            }}
            onCopyCoordinates={(id) => {
              const ann = drawing.annotations.find(a => a.id === id);
              if (ann) {
                navigator.clipboard.writeText(JSON.stringify(ann.geometry));
              }
            }}
            onDelete={(id) => {
              drawing.deleteAnnotation(id);
            }}
          />
          {drawing.activeTool === 'draw_plots' && (
            <DrawPlotsPanel 
              onClose={() => drawing.setActiveTool(null)}
              config={drawing.plotGrid}
              onConfigChange={drawing.updatePlotGrid}
              onConfirm={drawing.confirmPlotGrid}
            />
          )}
          <MeasurementTooltip measurement={drawing.currentMeasurement} position={drawing.tooltipPosition} />

          {/* === Top-Right: Nav Controls (all unified) === */}
          <div className="absolute top-4 right-4 flex flex-col items-end gap-2 z-20">
            {/* Nav + Compare block */}
            <div className="bg-background/95 backdrop-blur shadow-md rounded-lg overflow-hidden flex flex-col border border-border">
              <Button variant="ghost" size="icon" onClick={zoomIn} title={t.map.zoomIn} className="h-9 w-9 shrink-0 rounded-none border-b border-border hover:bg-muted focus:ring-0">
                <ZoomIn className="w-4 h-4" />
              </Button>
              <Button variant="ghost" size="icon" onClick={zoomOut} title={t.map.zoomOut} className="h-9 w-9 shrink-0 rounded-none border-b border-border hover:bg-muted focus:ring-0">
                <ZoomOut className="w-4 h-4" />
              </Button>
              <Button variant="ghost" size="icon" onClick={() => setShowVectorLabels(!showVectorLabels)} title={showVectorLabels ? t.map.hideLabels : t.map.showLabels} className="h-9 w-9 shrink-0 rounded-none border-b border-border hover:bg-muted focus:ring-0">
                <Tag className={`w-4 h-4 ${showVectorLabels ? 'text-primary' : 'text-muted-foreground'}`} />
              </Button>
              <Button variant="ghost" size="icon" onClick={resetView} title={t.map.resetView} className="h-9 w-9 shrink-0 rounded-none border-b border-border hover:bg-muted focus:ring-0">
                <MapPin className="w-4 h-4" />
              </Button>
              <Button variant="ghost" size="icon" onClick={centerOnCurrentLocation} title={t.map.centerLocation} className="h-9 w-9 shrink-0 rounded-none border-b border-border hover:bg-muted focus:ring-0">
                <LocateFixed className="w-4 h-4" />
              </Button>
              <Button variant="ghost" size="icon" onClick={toggleFullscreen} title={isFullscreen ? t.map.exitFullscreen : t.map.enterFullscreen} className="h-9 w-9 shrink-0 rounded-none border-b border-border hover:bg-muted focus:ring-0">
                <Maximize2 className="w-4 h-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setSwipeEnabled(!swipeEnabled)}
                title={swipeEnabled ? t.map.exitCompare : t.map.compareMaps}
                className={`h-9 w-9 shrink-0 rounded-none hover:bg-muted focus:ring-0 ${swipeEnabled ? 'text-primary bg-primary/10' : ''}`}
              >
                <MoveHorizontal className="w-4 h-4" />
              </Button>
            </div>

            {/* Vectorization Tools — separate panel, same sizing */}
            <div className="bg-background/95 backdrop-blur shadow-md rounded-lg overflow-hidden flex flex-col border border-border">
              <VectorizationToolbar
                activeTool={drawing.activeTool}
                setActiveTool={drawing.setActiveTool}
                onImportClick={() => {
                  const input = document.createElement('input');
                  input.type = 'file';
                  input.accept = '.geojson,.json,.zip';
                  input.onchange = (e) => {
                    const file = (e.target as HTMLInputElement).files?.[0];
                    if (file) drawing.importFile(file);
                  };
                  input.click();
                }}
                onExportGeoJSON={drawing.exportGeoJSON}
                onUndo={drawing.undoLastEdit}
                canUndo={drawing.canUndo}
                onDeleteSelected={drawing.deleteSelected}
                canDelete={drawing.canDelete}
                onSaveAsVectorLayers={drawing.saveAsVectorLayers}
                isSavingVectorLayers={drawing.isSavingVectorLayers}
                onZonalStats={() => setShowZonalStats(true)}
                isPixelInspectorActive={isPixelInspectorActive}
                onTogglePixelInspector={() => {
                  if (!isPixelInspectorActive) drawing.setActiveTool(null);
                  setIsPixelInspectorActive(v => !v);
                }}
                hasActiveCogLayer={!!analysisTileUrl && analysisModeMap === 'Multispectral'}
              />
            </div>
          </div>

          {/* Zonal Stats Panel */}
          {showZonalStats && (
            <ZonalStatsPanel
              golfCourseId={golfCourseId}
              tilesets={tilesets}
              annotations={drawing.annotations}
              bandMapping={bandMapping}
              onClose={() => setShowZonalStats(false)}
            />
          )}

          {/* Pixel Inspector Tooltip */}
          <PixelInspectorTooltip
            map={map.current}
            isActive={isPixelInspectorActive && !!analysisTileUrl && analysisModeMap === 'Multispectral'}
            cogUrl={analysisTileUrl}
            selectedIndex={analysisIndex}
            bandMapping={bandMapping}
          />

          {/* === Top-Left: Layers Card + Analysis Panel (stacked column) === */}
          <div className="absolute top-4 left-4 z-20 flex flex-col gap-3 w-80">

            {/* ── Layers toggle button ── */}
            <button
              className="bg-background/95 backdrop-blur shadow-md border border-border rounded-lg px-3 py-2 flex items-center gap-2 text-sm font-semibold hover:bg-muted/60 transition-colors w-fit"
              onClick={() => setShowVectorLayerPanel(v => !v)}
            >
              <Layers className="w-4 h-4 text-primary" />
              <span>{t.map.layersBtn}</span>
              {showVectorLayerPanel && <X className="w-3 h-3 opacity-60 ml-0.5" />}
            </button>

            {/* ── Floating Layers Card (collapsible, scrollable, theme-matched) ── */}
            {showVectorLayerPanel && (
              <div className="w-80 bg-background/95 backdrop-blur-md shadow-md border border-border/50 rounded-xl overflow-hidden">
                {/* Card header */}
                <div className="flex items-center justify-between px-4 py-3 border-b border-border/50">
                  <div className="flex items-center gap-2">
                    <Layers className="w-4 h-4 text-primary" />
                    <span className="font-semibold text-sm tracking-wide text-foreground">{t.map.panelTitle}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={toggleAllUnifiedLayers}
                      className="text-[11px] font-bold text-primary hover:text-primary/80 transition-colors uppercase tracking-wider px-2 py-0.5 rounded hover:bg-primary/10"
                    >
                      {allLayersVisible ? t.map.hideAll : t.map.showAll}
                    </button>
                    <button
                      onClick={() => setShowVectorLayerPanel(false)}
                      className="p-1 rounded-md hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Scrollable layer list — fixed height so Plant Health panel is never pushed off screen */}
                <ScrollArea className="h-52 overflow-y-auto">
                  <div className="p-3 space-y-1">
                    {/* Sub-label */}
                    <span className="block text-[10px] font-bold uppercase tracking-widest text-muted-foreground/50 mb-2 px-1">{t.map.drawOrder}</span>

                    {unifiedLayers.length > 0 ? (
                      <DndContext
                        sensors={sensors}
                        collisionDetection={closestCenter}
                        onDragEnd={handleDragEnd}
                      >
                        <SortableContext
                          items={unifiedLayers.map(l => l.id)}
                          strategy={verticalListSortingStrategy}
                        >
                          {unifiedLayers.map((layer) => (
                            <SortableLayerItem
                              key={layer.id}
                              id={layer.id}
                              name={layer.name}
                              isVisible={layer.isVisible}
                              type={layer.type}
                              color={layer.color}
                              onToggle={handleUnifiedLayerToggle}
                              editLabel={layer.editLabel}
                              editDate={layer.editDate}
                              onEdit={isAdmin ? handleLayerEdit : undefined}
                            />
                          ))}
                        </SortableContext>
                      </DndContext>
                    ) : (
                      <div className="text-center py-6 text-muted-foreground/50 text-sm">
                        {t.map.noLayers}
                      </div>
                    )}
                  </div>
                </ScrollArea>

                {/* Unified opacity slider — controls raster orthomosaics and health maps.
                    rasterOpacity is the source of truth shown in the UI; healthMapOpacity
                    tracks it so both layer types respond to the same control. */}
                {((selectedLayers.length > 0 && showRasterLayers) ||
                  (selectedHealthMapIds.length > 0 && showHealthMaps)) && (
                  <div className="px-4 py-3 border-t border-border/40">
                    <div className="flex justify-between text-[11px] font-semibold text-muted-foreground mb-2 uppercase tracking-wide">
                      <span>{t.map.baseImageryOpacity}</span>
                      <span className="text-foreground">{Math.round(rasterOpacity * 100)}%</span>
                    </div>
                    <input
                      type="range" min="0" max="1" step="0.05"
                      value={rasterOpacity}
                      onChange={e => {
                        const v = parseFloat(e.target.value);
                        setRasterOpacity(v);
                        setHealthMapOpacity(v);
                      }}
                      className="w-full h-1.5 mt-1 accent-primary rounded-full appearance-none cursor-pointer"
                    />
                  </div>
                )}
              </div>
            )}

            {/* ── Analysis / Plant Health Panel (always below layers card) ── */}
            <AnalysisPanel
               mapMode={analysisModeMap}
               isEnabled={analysisModeEnabled}
               onToggleEnable={setAnalysisModeEnabled}
               selectedIndex={analysisIndex}
               onSelectIndex={handleSelectIndex}
               range={analysisRange}
               onRangeChange={setAnalysisRange}
               histogramData={analysisHistogramData}
               bandMapping={bandMapping}
               onBandMappingChange={setBandMapping}
               isAdmin={isAdmin}
            />
          </div>

          {mapReady && (
            <MapAnalyticsEngine
              map={map.current}
              isEnabled={analysisModeEnabled}
              mode={analysisModeMap}
              tileUrl={analysisTileUrl}
              tileBounds={analysisTileBounds}
              tileMinZoom={analysisTileMinZoom}
              selectedIndex={analysisIndex}
              range={analysisRange}
              onHistogramData={setAnalysisHistogramData}
              bandMapping={bandMapping}
              onDataRange={setAnalysisRange}
            />
          )}



          {/* Swipe Selectors – bottom-center, only when active */}
          {swipeEnabled && (
            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-20 flex gap-4 w-auto max-w-2xl px-4 flex-row pointer-events-none">
              <div className="flex-1 bg-white/95 backdrop-blur-md rounded-full border border-gray-200/50 py-1.5 px-4 shadow-lg flex items-center gap-3 pointer-events-auto transition-transform hover:scale-[1.02]">
                <select
                  className="bg-transparent text-sm cursor-pointer outline-none text-gray-800 font-medium truncate max-w-[180px]"
                  value={swipeLeftLayerId || 'null'}
                  onChange={(e) => setSwipeLeftLayerId(e.target.value === 'null' ? null : e.target.value)}
                >
                  {swipeOptions.map(opt => (
                    <option key={'left-' + opt.id} value={opt.id}>{opt.name}</option>
                  ))}
                </select>
              </div>
              <div className="flex-1 bg-white/95 backdrop-blur-md rounded-full border border-gray-200/50 py-1.5 px-4 shadow-lg flex items-center gap-3 pointer-events-auto transition-transform hover:scale-[1.02]">
                <select
                  className="bg-transparent text-sm cursor-pointer outline-none text-gray-800 font-medium truncate max-w-[180px]"
                  value={swipeRightLayerId || 'null'}
                  onChange={(e) => setSwipeRightLayerId(e.target.value === 'null' ? null : e.target.value)}
                >
                  {swipeOptions.map(opt => (
                    <option key={'right-' + opt.id} value={opt.id}>{opt.name}</option>
                  ))}
                </select>
              </div>
            </div>
          )}

          <DualMapSwipe
            map={map.current}
            leftLayerId={swipeLeftLayerId}
            rightLayerId={swipeRightLayerId}
            enabled={swipeEnabled}
            onToggle={() => setSwipeEnabled(!swipeEnabled)}
            mapboxAccessToken={mapboxAccessToken}
            leftLayerMeta={getLayerMetadata(swipeLeftLayerId)}
            rightLayerMeta={getLayerMetadata(swipeRightLayerId)}
          />
        </div>
    </div>
  );
};

export default MapboxGolfCourseMap;
