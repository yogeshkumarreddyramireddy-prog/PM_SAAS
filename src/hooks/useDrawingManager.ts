import { useState, useEffect, useRef, useCallback } from 'react';
import mapboxgl from 'mapbox-gl';
import { Annotation, DrawingTool, PlotGridConfig, PlotLabelConfig, PendingAnnotation } from '@/types/annotation';
import { annotationService } from '@/lib/annotationService';
import { calculateLineLength, calculatePolygonArea, generatePlotGrid, labelPlotGrid, formatDistance, formatArea } from '@/lib/geoUtils';
import * as turf from '@turf/turf';

export function useDrawingManager(map: mapboxgl.Map | null, golfCourseId: number | null, mapReady: boolean) {
  const [activeTool, setActiveTool] = useState<DrawingTool>(null);
  const [currentMeasurement, setCurrentMeasurement] = useState<string | null>(null);
  const [tooltipPosition, setTooltipPosition] = useState<{ x: number, y: number } | null>(null);
  const [pendingAnnotation, setPendingAnnotation] = useState<PendingAnnotation | null>(null);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [selectedAnnotationIds, setSelectedAnnotationIds] = useState<Set<string>>(new Set());
  const [plotGrid, setPlotGrid] = useState<PlotGridConfig | null>(null);

  // Internal state for drawing
  const drawingCoords = useRef<[number, number][]>([]);
  const isDragging = useRef(false);

  // Constants
  const DRAWING_SOURCE = 'drawing-source';
  const ANNOTATIONS_SOURCE = 'annotations-source';

  const loadAnnotations = useCallback(async () => {
    if (!golfCourseId) return;
    try {
      const data = await annotationService.listAnnotations(golfCourseId);
      setAnnotations(data);
    } catch (err) {
      console.error("Failed to load annotations", err);
    }
  }, [golfCourseId]);

  // Initial load
  useEffect(() => {
    if (mapReady && golfCourseId) {
      loadAnnotations();
    }
  }, [mapReady, golfCourseId, loadAnnotations]);

  // Update map sources when annotations change
  useEffect(() => {
    if (!map || !mapReady || !map.getSource(ANNOTATIONS_SOURCE)) return;

    const featureCollection: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: annotations.map(ann => ({
        type: 'Feature',
        geometry: ann.geometry,
        properties: {
          ...ann.properties,
          id: ann.id,
          annotation_type: ann.annotation_type,
          plot_id: ann.plot_id,
          selected: selectedAnnotationIds.has(ann.id)
        }
      }))
    };

    (map.getSource(ANNOTATIONS_SOURCE) as mapboxgl.GeoJSONSource).setData(featureCollection);
  }, [annotations, selectedAnnotationIds, map, mapReady]);

  // Setup layers and sources
  useEffect(() => {
    if (!map || !mapReady) return;

    if (!map.getSource(DRAWING_SOURCE)) {
      map.addSource(DRAWING_SOURCE, {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] }
      });

      // Drawing layers
      map.addLayer({
        id: 'drawing-fill',
        type: 'fill',
        source: DRAWING_SOURCE,
        filter: ['==', '$type', 'Polygon'],
        paint: {
          'fill-color': '#00d2ff',
          'fill-opacity': 0.2
        }
      });

      map.addLayer({
        id: 'drawing-line',
        type: 'line',
        source: DRAWING_SOURCE,
        filter: ['in', '$type', 'LineString', 'Polygon'],
        paint: {
          'line-color': '#00d2ff',
          'line-width': 2,
          'line-dasharray': [2, 2]
        }
      });

      map.addLayer({
        id: 'drawing-points',
        type: 'circle',
        source: DRAWING_SOURCE,
        filter: ['==', '$type', 'Point'],
        paint: {
          'circle-radius': 5,
          'circle-color': '#fff',
          'circle-stroke-color': '#00d2ff',
          'circle-stroke-width': 2
        }
      });
      
      // Plot grid drawing layers (different color)
      map.addLayer({
        id: 'drawing-grid-fill',
        type: 'fill',
        source: DRAWING_SOURCE,
        filter: ['==', ['get', 'type'], 'grid_polygon'],
        paint: {
          'fill-color': '#eab308', // yellow
          'fill-opacity': 0.3
        }
      });
      
      map.addLayer({
        id: 'drawing-grid-line',
        type: 'line',
        source: DRAWING_SOURCE,
        filter: ['==', ['get', 'type'], 'grid_polygon'],
        paint: {
          'line-color': '#ef4444', // red
          'line-width': 1
        }
      });
    }

    if (!map.getSource(ANNOTATIONS_SOURCE)) {
      map.addSource(ANNOTATIONS_SOURCE, {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] }
      });

      // Saved annotations layers
      map.addLayer({
        id: 'annotations-fill',
        type: 'fill',
        source: ANNOTATIONS_SOURCE,
        filter: ['==', '$type', 'Polygon'],
        paint: {
          'fill-color': ['case', ['boolean', ['get', 'selected'], false], '#00d2ff', '#ffffff'],
          'fill-opacity': ['case', ['boolean', ['get', 'selected'], false], 0.4, 0.2]
        }
      });

      map.addLayer({
        id: 'annotations-line',
        type: 'line',
        source: ANNOTATIONS_SOURCE,
        filter: ['in', '$type', 'LineString', 'Polygon'],
        paint: {
          'line-color': ['case', ['boolean', ['get', 'selected'], false], '#00d2ff', '#ffffff'],
          'line-width': 2
        }
      });

      map.addLayer({
        id: 'annotations-points',
        type: 'circle',
        source: ANNOTATIONS_SOURCE,
        filter: ['==', '$type', 'Point'],
        paint: {
          'circle-radius': 5,
          'circle-color': ['case', ['boolean', ['get', 'selected'], false], '#00d2ff', '#ffffff'],
          'circle-stroke-color': '#000000',
          'circle-stroke-width': 1
        }
      });

      map.addLayer({
        id: 'annotations-labels',
        type: 'symbol',
        source: ANNOTATIONS_SOURCE,
        filter: ['has', 'plot_id'],
        layout: {
          'text-field': ['get', 'plot_id'],
          'text-size': 12,
          'text-anchor': 'center'
        },
        paint: {
          'text-color': '#000000',
          'text-halo-color': '#ffffff',
          'text-halo-width': 2
        }
      });
    }

    return () => {
      // Cleanup? Or leave them, we might remount
    };
  }, [map, mapReady]);

  // Handle active tool changes & cursor
  useEffect(() => {
    if (!map) return;
    
    // Clear drawing state
    drawingCoords.current = [];
    setCurrentMeasurement(null);
    setTooltipPosition(null);
    updateDrawingSource();
    
    if (activeTool === 'draw_point' || activeTool === 'draw_line' || activeTool === 'select_area') {
      map.getCanvas().style.cursor = 'crosshair';
    } else if (activeTool === 'select_multiple') {
      map.getCanvas().style.cursor = 'pointer';
    } else if (activeTool === 'draw_plots') {
      map.getCanvas().style.cursor = 'grab';
      // Initialize plot grid config at map center if none
      if (!plotGrid) {
        const center = map.getCenter();
        const initialConfig: PlotGridConfig = {
          numRows: 5,
          numColumns: 5,
          plotLength: 5,
          plotWidth: 5,
          gapLength: 1,
          gapWidth: 1,
          rotation: 0,
          centerLng: center.lng,
          centerLat: center.lat
        };
        setPlotGrid(initialConfig);
        renderPlotGrid(initialConfig);
      } else {
        renderPlotGrid(plotGrid);
      }
    } else {
      map.getCanvas().style.cursor = '';
      setPlotGrid(null); // clear grid if we switch away
    }

  }, [activeTool, map]);

  // Real-time updates to drawing source
  const updateDrawingSource = useCallback((hoverCoords?: [number, number]) => {
    if (!map || !map.getSource(DRAWING_SOURCE)) return;
    
    const coords = [...drawingCoords.current];
    if (hoverCoords && (activeTool === 'draw_line' || activeTool === 'select_area')) {
      coords.push(hoverCoords);
    }

    let feature: GeoJSON.Feature | null = null;

    if (activeTool === 'draw_point' && hoverCoords) {
      feature = turf.point(hoverCoords);
    } else if (activeTool === 'draw_line' && coords.length > 1) {
      feature = turf.lineString(coords);
    } else if (activeTool === 'select_area' && coords.length > 2) {
      // close the polygon for rendering
      const polyCoords = [...coords];
      if (polyCoords[0][0] !== polyCoords[polyCoords.length-1][0] || polyCoords[0][1] !== polyCoords[polyCoords.length-1][1]) {
        polyCoords.push(polyCoords[0]);
      }
      feature = turf.polygon([polyCoords]);
    } else if (coords.length > 0) {
      // Just render points if not enough for line/poly
      feature = turf.multiPoint(coords);
    }

    const featureCollection: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: feature ? [feature] : []
    };

    (map.getSource(DRAWING_SOURCE) as mapboxgl.GeoJSONSource).setData(featureCollection);

    // Update measurement
    if (activeTool === 'draw_line' && coords.length > 1) {
      const length = calculateLineLength(coords);
      setCurrentMeasurement(formatDistance(length));
      if (hoverCoords) {
        const point = map.project(hoverCoords);
        setTooltipPosition({ x: point.x, y: point.y });
      }
    } else if (activeTool === 'select_area' && coords.length > 2) {
      const polyCoords = [...coords];
      polyCoords.push(polyCoords[0]);
      const area = calculatePolygonArea(polyCoords);
      setCurrentMeasurement(formatArea(area));
      if (hoverCoords) {
        const point = map.project(hoverCoords);
        setTooltipPosition({ x: point.x, y: point.y });
      }
    } else {
      setCurrentMeasurement(null);
      setTooltipPosition(null);
    }

  }, [activeTool, map]);

  // Map interaction events
  useEffect(() => {
    if (!map || !activeTool) return;

    const onClick = (e: mapboxgl.MapMouseEvent) => {
      const coords: [number, number] = [e.lngLat.lng, e.lngLat.lat];
      
      if (activeTool === 'draw_point') {
        const geometry = turf.point(coords).geometry;
        setPendingAnnotation({ geometry });
        setActiveTool(null);
      } else if (activeTool === 'draw_line' || activeTool === 'select_area') {
        drawingCoords.current.push(coords);
        updateDrawingSource();
      } else if (activeTool === 'select_multiple') {
        // Find clicked features
        const features = map.queryRenderedFeatures(e.point, { layers: ['annotations-fill', 'annotations-line', 'annotations-points'] });
        if (features.length > 0) {
          const clickedId = features[0].properties?.id;
          if (clickedId) {
            setSelectedAnnotationIds(prev => {
              const next = new Set(prev);
              if (e.originalEvent.shiftKey) {
                if (next.has(clickedId)) next.delete(clickedId);
                else next.add(clickedId);
              } else {
                next.clear();
                next.add(clickedId);
              }
              return next;
            });
          }
        } else if (!e.originalEvent.shiftKey) {
          setSelectedAnnotationIds(new Set());
        }
      }
    };

    const onMouseMove = (e: mapboxgl.MapMouseEvent) => {
      if (activeTool === 'draw_line' || activeTool === 'select_area') {
        updateDrawingSource([e.lngLat.lng, e.lngLat.lat]);
      }
    };

    const onDblClick = (e: mapboxgl.MapMouseEvent) => {
      e.preventDefault(); // Stop zoom
      if (activeTool === 'draw_line' && drawingCoords.current.length > 1) {
        const geometry = turf.lineString(drawingCoords.current).geometry;
        const length = calculateLineLength(drawingCoords.current);
        setPendingAnnotation({ geometry, length });
        setActiveTool(null);
      } else if (activeTool === 'select_area' && drawingCoords.current.length > 2) {
        const coords = [...drawingCoords.current];
        coords.push(coords[0]); // close polygon
        const geometry = turf.polygon([coords]).geometry;
        const area = calculatePolygonArea(coords);
        setPendingAnnotation({ geometry, area });
        setActiveTool(null);
      }
    };

    map.on('click', onClick);
    map.on('mousemove', onMouseMove);
    map.on('dblclick', onDblClick);

    return () => {
      map.off('click', onClick);
      map.off('mousemove', onMouseMove);
      map.off('dblclick', onDblClick);
    };
  }, [map, activeTool, updateDrawingSource]);


  // Plot Grid Rendering
  const renderPlotGrid = useCallback((config: PlotGridConfig) => {
    if (!map || !map.getSource(DRAWING_SOURCE)) return;
    const grid = generatePlotGrid(config);
    
    // Add type for styling
    grid.features.forEach(f => {
      f.properties = { ...f.properties, type: 'grid_polygon' };
    });

    (map.getSource(DRAWING_SOURCE) as mapboxgl.GeoJSONSource).setData(grid);
  }, [map]);

  const updatePlotGrid = (partial: Partial<PlotGridConfig>) => {
    if (!plotGrid) return;
    const newConfig = { ...plotGrid, ...partial };
    setPlotGrid(newConfig);
    renderPlotGrid(newConfig);
  };

  const confirmPlotGrid = async (labelConfig: PlotLabelConfig) => {
    if (!plotGrid || !golfCourseId) return;
    
    // Generate final labeled grid
    let grid = generatePlotGrid(plotGrid);
    grid = labelPlotGrid(grid, labelConfig);

    const annotationsData = grid.features.map(f => ({
      golf_course_id: golfCourseId,
      geometry: f.geometry,
      annotation_type: 'area' as const,
      plot_id: f.properties?.plot_id,
      properties: {
        variety: f.properties?.variety,
        application_type: f.properties?.application_type,
        grid_config: plotGrid
      }
    }));

    try {
      await annotationService.createAnnotationsBatch(annotationsData);
      await loadAnnotations();
      setActiveTool(null);
    } catch (err) {
      console.error("Failed to save plot grid", err);
    }
  };

  // Actions
  const savePendingAnnotation = async (data: { plotId: string, externalCode: string, comment: string, properties: Record<string, any> }) => {
    if (!pendingAnnotation || !golfCourseId) return;

    let type: DrawingTool = 'select_area';
    if (pendingAnnotation.geometry.type === 'Point') type = 'draw_point';
    if (pendingAnnotation.geometry.type === 'LineString') type = 'draw_line';

    try {
      await annotationService.createAnnotation({
        golf_course_id: golfCourseId,
        geometry: pendingAnnotation.geometry,
        annotation_type: type === 'select_area' ? 'area' : type === 'draw_point' ? 'point' : 'line',
        plot_id: data.plotId || null,
        external_code: data.externalCode || null,
        comment: data.comment || null,
        properties: data.properties
      });
      await loadAnnotations();
      setPendingAnnotation(null);
    } catch (err) {
      console.error("Failed to save annotation", err);
    }
  };

  const cancelDrawing = () => {
    setPendingAnnotation(null);
    setActiveTool(null);
  };

  const deleteSelected = async () => {
    if (selectedAnnotationIds.size === 0) return;
    try {
      await annotationService.deleteAnnotationsBatch(Array.from(selectedAnnotationIds));
      setSelectedAnnotationIds(new Set());
      await loadAnnotations();
    } catch (err) {
      console.error("Failed to delete annotations", err);
    }
  };

  const importFile = async (file: File) => {
    if (!golfCourseId) return;
    try {
      if (file.name.endsWith('.zip')) {
        await annotationService.importShapefile(golfCourseId, file);
      } else if (file.name.endsWith('.geojson') || file.name.endsWith('.json')) {
        const text = await file.text();
        const featureCollection = JSON.parse(text);
        await annotationService.importGeoJSON(golfCourseId, featureCollection);
      }
      await loadAnnotations();
    } catch (err) {
      console.error("Failed to import file", err);
      alert("Failed to import file. Make sure it is a valid GeoJSON or Shapefile zip.");
    }
  };

  const exportGeoJSON = async () => {
    if (!golfCourseId) return;
    const geojson = await annotationService.exportGeoJSON(golfCourseId);
    const blob = new Blob([JSON.stringify(geojson, null, 2)], { type: 'application/geo+json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `annotations_${golfCourseId}.geojson`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return {
    activeTool,
    setActiveTool,
    currentMeasurement,
    tooltipPosition,
    pendingAnnotation,
    savePendingAnnotation,
    cancelDrawing,
    annotations,
    selectedAnnotationIds,
    deleteSelected,
    plotGrid,
    updatePlotGrid,
    confirmPlotGrid,
    importFile,
    exportGeoJSON
  };
}
