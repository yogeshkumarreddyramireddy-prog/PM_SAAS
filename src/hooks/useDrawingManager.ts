import { useState, useEffect, useRef, useCallback } from 'react';
import mapboxgl from 'mapbox-gl';
import { Annotation, DrawingTool, PlotGridConfig, PlotLabelConfig, PendingAnnotation, DragState } from '@/types/annotation';
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
  const [contextMenu, setContextMenu] = useState<{ x: number, y: number, annotationId: string } | null>(null);
  const [editingAnnotation, setEditingAnnotation] = useState<Annotation | null>(null);

  // Internal state for drawing
  const drawingCoords = useRef<[number, number][]>([]);

  // Constants
  const DRAWING_SOURCE = 'drawing-source';
  const ANNOTATIONS_SOURCE = 'annotations-source';
  const EDIT_HANDLES_SOURCE = 'edit-handles-source';

  // Edit State
  const editAnnotationId = useRef<string | null>(null);
  const editGeometry = useRef<GeoJSON.Geometry | null>(null);
  const multiEditGeometries = useRef<{ id: string; geometry: GeoJSON.Geometry }[]>([]);
  const dragState = useRef<DragState>({ isDragging: false, type: null });
  const editHistory = useRef<{ annotationId: string, geometry: GeoJSON.Geometry }[]>([]);
  const [historyLength, setHistoryLength] = useState(0);

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
          'fill-color': '#eab308',
          'fill-opacity': 0.3
        }
      });
      
      map.addLayer({
        id: 'drawing-grid-line',
        type: 'line',
        source: DRAWING_SOURCE,
        filter: ['==', ['get', 'type'], 'grid_polygon'],
        paint: {
          'line-color': '#ef4444',
          'line-width': 1
        }
      });
    }

    if (!map.getSource(EDIT_HANDLES_SOURCE)) {
      map.addSource(EDIT_HANDLES_SOURCE, {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] }
      });


      map.addLayer({
        id: 'edit-handles-preview-fill',
        type: 'fill',
        source: EDIT_HANDLES_SOURCE,
        filter: ['all', ['==', 'type', 'preview'], ['==', '$type', 'Polygon']],
        paint: {
          'fill-color': '#00d2ff',
          'fill-opacity': 0.5
        }
      });
      map.addLayer({
        id: 'edit-handles-preview-line',
        type: 'line',
        source: EDIT_HANDLES_SOURCE,
        filter: ['all', ['==', 'type', 'preview'], ['in', '$type', 'LineString', 'Polygon']],
        paint: {
          'line-color': '#ff0000',
          'line-width': 3
        }
      });
      map.addLayer({
        id: 'edit-handles-preview-point',
        type: 'circle',
        source: EDIT_HANDLES_SOURCE,
        filter: ['all', ['==', 'type', 'preview'], ['==', '$type', 'Point']],
        paint: {
          'circle-radius': 7,
          'circle-color': '#00d2ff',
          'circle-stroke-color': '#000000',
          'circle-stroke-width': 1
        }
      });

      map.addLayer({
        id: 'edit-handles-vertex',
        type: 'circle',
        source: EDIT_HANDLES_SOURCE,
        filter: ['==', 'type', 'vertex'],
        paint: {
          'circle-radius': 8,
          'circle-color': '#ffffff',
          'circle-stroke-color': '#ff0000',
          'circle-stroke-width': 2
        }
      });

      map.addLayer({
        id: 'edit-handles-scale',
        type: 'circle',
        source: EDIT_HANDLES_SOURCE,
        filter: ['==', 'type', 'scale'],
        paint: {
          'circle-radius': 10,
          'circle-color': '#f97316',
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': 2
        }
      });

      map.addLayer({
        id: 'edit-handles-scale-icon',
        type: 'symbol',
        source: EDIT_HANDLES_SOURCE,
        filter: ['==', 'type', 'scale'],
        layout: {
          'text-field': '⤡',
          'text-size': 12,
          'text-allow-overlap': true
        },
        paint: { 'text-color': '#ffffff' }
      });

      map.addLayer({
        id: 'edit-handles-rotate-line',
        type: 'line',
        source: EDIT_HANDLES_SOURCE,
        filter: ['==', 'type', 'rotate_line'],
        paint: {
          'line-color': '#3b82f6',
          'line-width': 2,
          'line-dasharray': [2, 2]
        }
      });

      map.addLayer({
        id: 'edit-handles-rotate',
        type: 'circle',
        source: EDIT_HANDLES_SOURCE,
        filter: ['==', 'type', 'rotate'],
        paint: {
          'circle-radius': 10,
          'circle-color': '#3b82f6',
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': 2
        }
      });

      map.addLayer({
        id: 'edit-handles-rotate-icon',
        type: 'symbol',
        source: EDIT_HANDLES_SOURCE,
        filter: ['==', 'type', 'rotate'],
        layout: {
          'text-field': '↻',
          'text-size': 14,
          'text-allow-overlap': true
        },
        paint: { 'text-color': '#ffffff' }
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
          'line-color': ['case', ['boolean', ['get', 'selected'], false], '#ff0000', ['case', ['boolean', ['get', 'selected'], false], '#00d2ff', '#ffffff']],
          'line-width': ['case', ['boolean', ['get', 'selected'], false], 3, 2]
        }
      });

      map.addLayer({
        id: 'annotations-points',
        type: 'circle',
        source: ANNOTATIONS_SOURCE,
        filter: ['==', '$type', 'Point'],
        paint: {
          'circle-radius': ['case', ['boolean', ['get', 'selected'], false], 7, 5],
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

    return () => {};
  }, [map, mapReady]);

  // Update map sources when annotations change
  useEffect(() => {
    if (!map || !mapReady || !map.getSource(ANNOTATIONS_SOURCE)) return;
    if (dragState.current.isDragging) return; // Prevent overwriting during live dragging

    const featureCollection: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: annotations.map(ann => ({
        type: 'Feature',
        geometry: ann.id === editAnnotationId.current && editGeometry.current ? editGeometry.current : ann.geometry,
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
      if (!plotGrid) {
        const center = map.getCenter();
        const initialConfig: PlotGridConfig = {
          numRows: 5, numColumns: 5, plotLength: 5, plotWidth: 5, gapLength: 1, gapWidth: 1,
          rotation: 0, centerLng: center.lng, centerLat: center.lat
        };
        setPlotGrid(initialConfig);
        renderPlotGrid(initialConfig);
      } else {
        renderPlotGrid(plotGrid);
      }
    } else {
      map.getCanvas().style.cursor = '';
      setPlotGrid(null);
    }
  }, [activeTool, map]);

  // Edit Handles Rendering
  const renderEditHandles = useCallback(() => {
    if (!map || !map.getSource(EDIT_HANDLES_SOURCE)) return;
    
    const features: GeoJSON.Feature[] = [];

    if (multiEditGeometries.current.length > 0) {
      multiEditGeometries.current.forEach(item => {
        features.push({
          type: 'Feature',
          geometry: item.geometry,
          properties: { type: 'preview' }
        });
      });
      (map.getSource(EDIT_HANDLES_SOURCE) as mapboxgl.GeoJSONSource).setData({ type: 'FeatureCollection', features });
      return;
    }

    if (!editGeometry.current || !editAnnotationId.current) {
       (map.getSource(EDIT_HANDLES_SOURCE) as mapboxgl.GeoJSONSource).setData({ type: 'FeatureCollection', features: [] });
       return;
    }

    const geom = editGeometry.current;

    // Add preview geometry
    features.push({
      type: 'Feature',
      geometry: geom,
      properties: { type: 'preview' }
    });

    if (geom.type === 'Point') {
        features.push(turf.point(geom.coordinates, { type: 'vertex', index: 0 }));
    } else if (geom.type === 'LineString') {
        geom.coordinates.forEach((coord, i) => {
            features.push(turf.point(coord, { type: 'vertex', index: i }));
        });
    } else if (geom.type === 'Polygon' || geom.type === 'MultiPolygon') {
        let coords = geom.type === 'Polygon' ? geom.coordinates : geom.coordinates[0];
        // Show all vertices for polygons (including closing vertex if needed, though visually overlapping is fine, let's just show all distinct or all of them)
        coords[0].forEach((coord, i) => {
             features.push(turf.point(coord, { type: 'vertex', index: i }));
        });
        
        const bbox = turf.bbox(geom); // [minX, minY, maxX, maxY]
        const minX = bbox[0];
        const minY = bbox[1];
        const maxX = bbox[2];
        const maxY = bbox[3];

        // 4 corners for scale
        features.push(turf.point([minX, maxY], { type: 'scale' })); // Top-left
        features.push(turf.point([maxX, maxY], { type: 'scale' })); // Top-right
        features.push(turf.point([minX, minY], { type: 'scale' })); // Bottom-left
        features.push(turf.point([maxX, minY], { type: 'scale' })); // Bottom-right

        // Rotate handle at top-center, offset slightly above
        const topCenterX = (minX + maxX) / 2;
        const height = maxY - minY;
        // The offset depends on map projection, but let's just use a percentage of height or a fixed geo-distance
        const rotateY = maxY + (height * 0.1); 
        
        features.push(turf.lineString([[topCenterX, maxY], [topCenterX, rotateY]], { type: 'rotate_line' }));
        features.push(turf.point([topCenterX, rotateY], { type: 'rotate' }));
    }

    (map.getSource(EDIT_HANDLES_SOURCE) as mapboxgl.GeoJSONSource).setData({ type: 'FeatureCollection', features });


  }, [annotations, selectedAnnotationIds, map]);

  useEffect(() => {
    if (!map) return;
    const hideIds = activeTool === 'select_multiple' ? Array.from(selectedAnnotationIds) : [];
    if (map.getLayer('annotations-fill')) {
      if (hideIds.length > 0) {
        map.setFilter('annotations-fill', ['all', ['==', '$type', 'Polygon'], ['!in', 'id', ...hideIds]]);
        map.setFilter('annotations-line', ['all', ['in', '$type', 'LineString', 'Polygon'], ['!in', 'id', ...hideIds]]);
        map.setFilter('annotations-points', ['all', ['==', '$type', 'Point'], ['!in', 'id', ...hideIds]]);
      } else {
        map.setFilter('annotations-fill', ['==', '$type', 'Polygon']);
        map.setFilter('annotations-line', ['in', '$type', 'LineString', 'Polygon']);
        map.setFilter('annotations-points', ['==', '$type', 'Point']);
      }
    }
  }, [selectedAnnotationIds, activeTool, map]);

  useEffect(() => {
    if (selectedAnnotationIds.size === 1 && activeTool === 'select_multiple') {
      const id = Array.from(selectedAnnotationIds)[0];
      const ann = annotations.find(a => a.id === id);
      if (ann) {
        editAnnotationId.current = id;
        editGeometry.current = JSON.parse(JSON.stringify(ann.geometry));
        multiEditGeometries.current = [];
        renderEditHandles();
      }
    } else if (selectedAnnotationIds.size > 1 && activeTool === 'select_multiple') {
      editAnnotationId.current = null;
      editGeometry.current = null;
      multiEditGeometries.current = Array.from(selectedAnnotationIds).map(id => {
        const ann = annotations.find(a => a.id === id);
        return ann ? { id, geometry: JSON.parse(JSON.stringify(ann.geometry)) } : null;
      }).filter(Boolean) as { id: string; geometry: GeoJSON.Geometry }[];
      renderEditHandles();
    } else {
      editAnnotationId.current = null;
      editGeometry.current = null;
      multiEditGeometries.current = [];
      renderEditHandles();
    }
  }, [selectedAnnotationIds, activeTool, annotations, renderEditHandles]);


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
      const polyCoords = [...coords];
      if (polyCoords[0][0] !== polyCoords[polyCoords.length-1][0] || polyCoords[0][1] !== polyCoords[polyCoords.length-1][1]) {
        polyCoords.push(polyCoords[0]);
      }
      feature = turf.polygon([polyCoords]);
    } else if (coords.length > 0) {
      feature = turf.multiPoint(coords);
    }

    const featureCollection: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: feature ? [feature] : []
    };

    (map.getSource(DRAWING_SOURCE) as mapboxgl.GeoJSONSource).setData(featureCollection);

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

  // Keyboard listener for Delete
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Delete' || e.key === 'Backspace') {
        // Prevent deleting if typing in an input
        if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)) return;
        if (selectedAnnotationIds.size > 0) {
          deleteSelected();
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [selectedAnnotationIds]);

  // Map interaction events
  useEffect(() => {
    if (!map || !activeTool) return;

    const onMouseDown = (e: mapboxgl.MapMouseEvent) => {
      if (activeTool !== 'select_multiple') return;
      
      if (selectedAnnotationIds.size === 1 && editGeometry.current) {
        // Use a tolerance box around the click point for easier handle targeting
        const tolerance = 12;
        const bbox: [mapboxgl.PointLike, mapboxgl.PointLike] = [
          [e.point.x - tolerance, e.point.y - tolerance],
          [e.point.x + tolerance, e.point.y + tolerance]
        ];
        const handleFeatures = map.queryRenderedFeatures(bbox, { layers: ['edit-handles-vertex', 'edit-handles-scale', 'edit-handles-rotate'] });
        if (handleFeatures.length > 0) {
          e.preventDefault();
          map.dragPan.disable();
          const type = handleFeatures[0].properties?.type;
          const index = handleFeatures[0].properties?.index;
          
          dragState.current = {
            isDragging: true,
            type: type,
            vertexIndex: index,
            startLngLat: [e.lngLat.lng, e.lngLat.lat],
            startGeometry: JSON.parse(JSON.stringify(editGeometry.current)),
            startCentroid: turf.centroid(editGeometry.current as any).geometry.coordinates as [number, number]
          };
          return;
        }
      }

      // Check if clicking on the preview body (for translate) or on the main annotation layers
      const previewFeatures = map.queryRenderedFeatures(e.point, { layers: ['edit-handles-preview-fill', 'edit-handles-preview-line', 'edit-handles-preview-point'] });
      const annFeatures = map.queryRenderedFeatures(e.point, { layers: ['annotations-fill', 'annotations-line', 'annotations-points'] });
      
      // If we clicked on the preview body of the currently-edited annotation, start translate
      if (previewFeatures.length > 0 && selectedAnnotationIds.size === 1 && editGeometry.current) {
        e.preventDefault();
        map.dragPan.disable();
        dragState.current = {
          isDragging: true,
          type: 'translate',
          startLngLat: [e.lngLat.lng, e.lngLat.lat],
          startGeometry: JSON.parse(JSON.stringify(editGeometry.current)),
          startCentroid: turf.centroid(editGeometry.current as any).geometry.coordinates as [number, number]
        };
        return;
      }
      
      if (annFeatures.length > 0) {
        const clickedId = annFeatures[0].properties?.id;
        if (selectedAnnotationIds.has(clickedId)) {
          e.preventDefault();
          map.dragPan.disable();
          
          if (selectedAnnotationIds.size === 1) {
            dragState.current = {
              isDragging: true,
              type: 'translate',
              startLngLat: [e.lngLat.lng, e.lngLat.lat],
              startGeometry: JSON.parse(JSON.stringify(editGeometry.current)),
              startCentroid: turf.centroid(editGeometry.current as any).geometry.coordinates as [number, number]
            };
          } else {
            dragState.current = {
              isDragging: true,
              type: 'multi-translate',
              startLngLat: [e.lngLat.lng, e.lngLat.lat],
              startGeometries: JSON.parse(JSON.stringify(multiEditGeometries.current))
            };
          }
          return;
        }
      }
    };

    const onClick = (e: mapboxgl.MapMouseEvent) => {
      if (dragState.current.isDragging) {
        // Only ignore click if we actually moved
        const start = dragState.current.startLngLat;
        if (start) {
          const dist = Math.hypot(e.lngLat.lng - start[0], e.lngLat.lat - start[1]);
          if (dist > 0.000001) return; // We actually dragged
        }
      }
      
      const coords: [number, number] = [e.lngLat.lng, e.lngLat.lat];
      
      if (activeTool === 'draw_point') {
        const geometry = turf.point(coords).geometry;
        setPendingAnnotation({ geometry });
        setActiveTool(null);
      } else if (activeTool === 'draw_line' || activeTool === 'select_area') {
        drawingCoords.current.push(coords);
        updateDrawingSource();
      } else if (activeTool === 'select_multiple') {
        const features = map.queryRenderedFeatures(e.point, { layers: ['annotations-fill', 'annotations-line', 'annotations-points'] });
        if (features.length > 0) {
          const clickedId = features[0].properties?.id;
          if (clickedId) {
            setSelectedAnnotationIds(prev => {
              const next = new Set(prev);
              const isMulti = e.originalEvent.shiftKey || e.originalEvent.metaKey || e.originalEvent.ctrlKey;
              if (isMulti) {
                if (next.has(clickedId)) next.delete(clickedId);
                else next.add(clickedId);
              } else {
                next.clear();
                next.add(clickedId);
              }
              return next;
            });
          }
        } else {
          const isMulti = e.originalEvent.shiftKey || e.originalEvent.metaKey || e.originalEvent.ctrlKey;
          if (!isMulti) {
            setSelectedAnnotationIds(new Set());
          }
        }
      }
    };

    let animationFrameId: number;

    const onMouseMove = (e: mapboxgl.MapMouseEvent) => {
      if (activeTool === 'draw_line' || activeTool === 'select_area') {
        updateDrawingSource([e.lngLat.lng, e.lngLat.lat]);
        return;
      }

      if (dragState.current.isDragging) {
        if (animationFrameId) cancelAnimationFrame(animationFrameId);
        
        const { type, vertexIndex, startLngLat, startGeometry, startCentroid, startGeometries } = dragState.current;
        const currentLngLat: [number, number] = [e.lngLat.lng, e.lngLat.lat];
        
        animationFrameId = requestAnimationFrame(() => {
          if (type === 'multi-translate' && startGeometries && startLngLat) {
            const dx = currentLngLat[0] - startLngLat[0];
            const dy = currentLngLat[1] - startLngLat[1];
            
            multiEditGeometries.current = startGeometries.map(sg => {
              const newGeom = JSON.parse(JSON.stringify(sg.geometry));
              turf.coordEach(newGeom, (currentCoord) => {
                currentCoord[0] += dx;
                currentCoord[1] += dy;
              });
              return { id: sg.id, geometry: newGeom };
            });
            renderEditHandles();
            return;
          }

          if (editGeometry.current && startGeometry) {
            let newGeom = JSON.parse(JSON.stringify(startGeometry));
            
            if (type === 'vertex' && vertexIndex !== undefined) {
                if (newGeom.type === 'Polygon') {
                   newGeom.coordinates[0][vertexIndex] = currentLngLat;
                   if (vertexIndex === 0) newGeom.coordinates[0][newGeom.coordinates[0].length - 1] = currentLngLat;
                } else if (newGeom.type === 'LineString') {
                   newGeom.coordinates[vertexIndex] = currentLngLat;
                } else if (newGeom.type === 'Point') {
                   newGeom.coordinates = currentLngLat;
                }
            } else if (type === 'translate' && startLngLat) {
                const dx = currentLngLat[0] - startLngLat[0];
                const dy = currentLngLat[1] - startLngLat[1];
                turf.coordEach(newGeom, (currentCoord) => {
                   currentCoord[0] += dx;
                   currentCoord[1] += dy;
                });
            } else if (type === 'scale' && startLngLat && startCentroid) {
                const startDist = turf.distance(startCentroid, startLngLat);
                const currentDist = turf.distance(startCentroid, currentLngLat);
                if (startDist > 0) {
                  const factor = currentDist / startDist;
                  const feat = turf.feature(startGeometry);
                  newGeom = turf.transformScale(feat, factor, { origin: startCentroid }).geometry;
                }
            } else if (type === 'rotate' && startLngLat && startCentroid) {
                const startBearing = turf.bearing(startCentroid, startLngLat);
                const currentBearing = turf.bearing(startCentroid, currentLngLat);
                const angleDelta = currentBearing - startBearing;
                const feat = turf.feature(startGeometry);
                newGeom = turf.transformRotate(feat, angleDelta, { pivot: startCentroid }).geometry;
            }

            editGeometry.current = newGeom;
            renderEditHandles();
          }
        });
      }
    };

    const onMouseUp = async (e: mapboxgl.MapMouseEvent) => {
      if (dragState.current.isDragging) {
        map.dragPan.enable();
        
        const start = dragState.current.startLngLat;
        const dist = start ? Math.hypot(e.lngLat.lng - start[0], e.lngLat.lat - start[1]) : 0;
        
        if (dist > 0.000001) {
          if (dragState.current.type === 'multi-translate' && multiEditGeometries.current.length > 0) {
            const updates = multiEditGeometries.current;
            
            setAnnotations(prev => prev.map(a => {
              const upd = updates.find(u => u.id === a.id);
              if (upd) {
                const geom = JSON.parse(JSON.stringify(upd.geometry));
                delete (geom as any).bbox;
                return { ...a, geometry: geom };
              }
              return a;
            }));

            try {
               await Promise.all(updates.map(u => {
                 const geom = JSON.parse(JSON.stringify(u.geometry));
                 delete (geom as any).bbox;
                 return annotationService.updateAnnotation(u.id, { geometry: geom });
               }));
            } catch (err) {
               console.error('Failed to save multi edit', err);
               await loadAnnotations(); 
            }
          } else if (editAnnotationId.current && editGeometry.current && dragState.current.startGeometry) {
            editHistory.current.push({
              annotationId: editAnnotationId.current,
              geometry: dragState.current.startGeometry
            });
            setHistoryLength(editHistory.current.length);

            const newGeom = JSON.parse(JSON.stringify(editGeometry.current));
            delete (newGeom as any).bbox; // Prevent Supabase PostGIS errors
            const id = editAnnotationId.current;
            
            setAnnotations(prev => prev.map(a => a.id === id ? { ...a, geometry: newGeom } : a));

            try {
               await annotationService.updateAnnotation(id, { geometry: newGeom });
            } catch (err) {
               console.error('Failed to save edit', err);
               await loadAnnotations(); 
            }
          }
        }
        
        setTimeout(() => {
           dragState.current = { isDragging: false, type: null };
        }, 100);
      }
    };

    const onContextMenu = (e: mapboxgl.MapMouseEvent) => {
      const features = map.queryRenderedFeatures(e.point, { layers: ['annotations-fill', 'annotations-line', 'annotations-points'] });
      if (features.length > 0 && features[0].properties?.id) {
        e.preventDefault();
        setContextMenu({
          x: e.point.x,
          y: e.point.y,
          annotationId: features[0].properties.id
        });
      } else {
        setContextMenu(null);
      }
    };

    const onDblClick = (e: mapboxgl.MapMouseEvent) => {
      if (dragState.current.isDragging) return;
      e.preventDefault(); 
      if (activeTool === 'select_multiple') {
        const features = map.queryRenderedFeatures(e.point, { layers: ['annotations-fill', 'annotations-line', 'annotations-points'] });
        if (features.length > 0 && features[0].properties?.id) {
          const id = features[0].properties.id;
          const ann = annotations.find(a => a.id === id);
          if (ann) {
            setEditingAnnotation(ann);
          }
          return;
        }
      }
      if (activeTool === 'draw_line' && drawingCoords.current.length > 1) {
        const geometry = turf.lineString(drawingCoords.current).geometry;
        const length = calculateLineLength(drawingCoords.current);
        setPendingAnnotation({ geometry, length });
        setActiveTool(null);
      } else if (activeTool === 'select_area' && drawingCoords.current.length > 2) {
        const coords = [...drawingCoords.current];
        coords.push(coords[0]); 
        const geometry = turf.polygon([coords]).geometry;
        const area = calculatePolygonArea(coords);
        setPendingAnnotation({ geometry, area });
        setActiveTool(null);
      }
    };

    map.on('mousedown', onMouseDown);
    map.on('click', onClick);
    map.on('mousemove', onMouseMove);
    map.on('mouseup', onMouseUp);
    map.on('dblclick', onDblClick);
    map.on('contextmenu', onContextMenu);

    return () => {
      map.off('mousedown', onMouseDown);
      map.off('click', onClick);
      map.off('mousemove', onMouseMove);
      map.off('mouseup', onMouseUp);
      map.off('dblclick', onDblClick);
      map.off('contextmenu', onContextMenu);
    };
  }, [map, activeTool, updateDrawingSource, renderEditHandles, loadAnnotations]);


  const renderPlotGrid = useCallback((config: PlotGridConfig) => {
    if (!map || !map.getSource(DRAWING_SOURCE)) return;
    const grid = generatePlotGrid(config);
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

  const undoLastEdit = async () => {
    if (editHistory.current.length === 0) return;
    const lastEdit = editHistory.current.pop();
    if (!lastEdit) return;

    // Optimistic revert
    setAnnotations(prev => prev.map(a => a.id === lastEdit.annotationId ? { ...a, geometry: lastEdit.geometry } : a));
    
    setHistoryLength(editHistory.current.length);
    if (editAnnotationId.current === lastEdit.annotationId) {
       editGeometry.current = lastEdit.geometry;
       renderEditHandles();
    }

    try {
      await annotationService.updateAnnotation(lastEdit.annotationId, { geometry: lastEdit.geometry });
    } catch (err) {
      console.error("Failed to undo", err);
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

  const updateAnnotationProperties = async (id: string, data: { plotId: string, externalCode: string, comment: string, properties: Record<string, any> }) => {
    try {
      const updated = await annotationService.updateAnnotation(id, {
        plot_id: data.plotId,
        external_code: data.externalCode,
        comment: data.comment,
        properties: data.properties
      });
      setAnnotations(prev => prev.map(a => a.id === id ? updated : a));
    } catch (err) {
      console.error("Failed to update annotation properties", err);
    }
  };

  const deleteAnnotation = async (id: string) => {
    try {
      await annotationService.deleteAnnotation(id);
      setAnnotations(prev => prev.filter(a => a.id !== id));
      setSelectedAnnotationIds(prev => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    } catch (err) {
      console.error("Failed to delete annotation", err);
    }
  };

  return {
    activeTool, setActiveTool, currentMeasurement, tooltipPosition,
    pendingAnnotation, savePendingAnnotation, cancelDrawing,
    annotations, selectedAnnotationIds, deleteSelected, deleteAnnotation,
    plotGrid, updatePlotGrid, confirmPlotGrid,
    importFile, exportGeoJSON, undoLastEdit, canUndo: historyLength > 0,
    canDelete: selectedAnnotationIds.size > 0,
    contextMenu, setContextMenu, editingAnnotation, setEditingAnnotation,
    updateAnnotationProperties
  };
}
