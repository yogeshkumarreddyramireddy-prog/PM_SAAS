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
  const animFrameRef = useRef<number>(0);
  const annotationsRef = useRef<Annotation[]>([]);
  const selectedAnnotationIdsRef = useRef<Set<string>>(new Set());

  const loadAnnotations = useCallback(async () => {
    if (!golfCourseId) return;
    try {
      const data = await annotationService.listAnnotations(golfCourseId);
      setAnnotations(data);
    } catch (err) {
      console.error("Failed to load annotations", err);
    }
  }, [golfCourseId]);

  // Keep refs in sync so renderEditHandles can read current values without dep-array coupling
  useEffect(() => { annotationsRef.current = annotations; }, [annotations]);
  useEffect(() => { selectedAnnotationIdsRef.current = selectedAnnotationIds; }, [selectedAnnotationIds]);

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

    // Annotations added BEFORE edit-handles so interactive handles render on top
    if (!map.getSource(ANNOTATIONS_SOURCE)) {
      map.addSource(ANNOTATIONS_SOURCE, {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] }
      });

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
          'line-color': ['case', ['boolean', ['get', 'selected'], false], '#ff0000', '#ffffff'],
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

    // Edit-handle layers added AFTER annotations so they render on top
    if (!map.getSource(EDIT_HANDLES_SOURCE)) {
      map.addSource(EDIT_HANDLES_SOURCE, {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] }
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
          'text-field': ['case',
            ['in', ['get', 'edge'], ['literal', ['top', 'bottom']]], '↕',
            '↔'
          ],
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

  // Edit Handles Rendering — also keeps the annotation source live so there's never a ghost at the old position
  const renderEditHandles = useCallback(() => {
    if (!map || !map.getSource(EDIT_HANDLES_SOURCE) || !map.getSource(ANNOTATIONS_SOURCE)) return;

    // Always push current geometries into the annotation source so it stays in sync during drag
    const annotationFeatures: GeoJSON.Feature[] = annotationsRef.current.map(ann => {
      const multiGeom = multiEditGeometries.current.find(m => m.id === ann.id)?.geometry;
      const geometry = multiGeom
        ?? (ann.id === editAnnotationId.current && editGeometry.current ? editGeometry.current : ann.geometry);
      return {
        type: 'Feature',
        geometry,
        properties: {
          ...ann.properties,
          id: ann.id,
          annotation_type: ann.annotation_type,
          plot_id: ann.plot_id,
          selected: selectedAnnotationIdsRef.current.has(ann.id)
        }
      };
    });
    (map.getSource(ANNOTATIONS_SOURCE) as mapboxgl.GeoJSONSource).setData({
      type: 'FeatureCollection',
      features: annotationFeatures
    });

    // For multi-selection there are no single-annotation handle controls
    if (multiEditGeometries.current.length > 0) {
      (map.getSource(EDIT_HANDLES_SOURCE) as mapboxgl.GeoJSONSource).setData({ type: 'FeatureCollection', features: [] });
      return;
    }

    if (!editGeometry.current || !editAnnotationId.current) {
      (map.getSource(EDIT_HANDLES_SOURCE) as mapboxgl.GeoJSONSource).setData({ type: 'FeatureCollection', features: [] });
      return;
    }

    // Build only the interactive handle markers (no duplicate shape feature)
    const handleFeatures: GeoJSON.Feature[] = [];
    const geom = editGeometry.current;

    if (geom.type === 'Point') {
      handleFeatures.push(turf.point(geom.coordinates, { type: 'vertex', index: 0 }));
    } else if (geom.type === 'LineString') {
      geom.coordinates.forEach((coord, i) => {
        handleFeatures.push(turf.point(coord, { type: 'vertex', index: i }));
      });
    } else if (geom.type === 'Polygon' || geom.type === 'MultiPolygon') {
      const coords = geom.type === 'Polygon' ? geom.coordinates : geom.coordinates[0];
      coords[0].forEach((coord, i) => {
        handleFeatures.push(turf.point(coord, { type: 'vertex', index: i }));
      });

      const bbox = turf.bbox(geom);
      const [minX, minY, maxX, maxY] = bbox;
      const midX = (minX + maxX) / 2;
      const midY = (minY + maxY) / 2;

      handleFeatures.push(turf.point([midX, maxY], { type: 'scale', edge: 'top' }));
      handleFeatures.push(turf.point([midX, minY], { type: 'scale', edge: 'bottom' }));
      handleFeatures.push(turf.point([minX, midY], { type: 'scale', edge: 'left' }));
      handleFeatures.push(turf.point([maxX, midY], { type: 'scale', edge: 'right' }));

      const height = maxY - minY;
      const rotateY = maxY + (height * 0.1);
      handleFeatures.push(turf.lineString([[midX, maxY], [midX, rotateY]], { type: 'rotate_line' }));
      handleFeatures.push(turf.point([midX, rotateY], { type: 'rotate' }));
    }

    (map.getSource(EDIT_HANDLES_SOURCE) as mapboxgl.GeoJSONSource).setData({ type: 'FeatureCollection', features: handleFeatures });
  }, [map]);

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
      const lineMid = turf.midpoint(turf.point(coords[0]), turf.point(coords[coords.length - 1]));
      const point = map.project(lineMid.geometry.coordinates as [number, number]);
      setTooltipPosition({ x: point.x, y: point.y });
    } else if (activeTool === 'select_area' && coords.length > 2) {
      const polyCoords = [...coords];
      polyCoords.push(polyCoords[0]);
      const area = calculatePolygonArea(polyCoords);
      setCurrentMeasurement(formatArea(area));
      const centroid = turf.centroid(turf.polygon([polyCoords]));
      const centroidCoords = centroid.geometry.coordinates as [number, number];
      const point = map.project(centroidCoords);
      setTooltipPosition({ x: point.x, y: point.y });
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
          map.getCanvas().style.cursor = 'grabbing';
          const type = handleFeatures[0].properties?.type;
          const index = handleFeatures[0].properties?.index;
          const edge = handleFeatures[0].properties?.edge;

          dragState.current = {
            isDragging: true,
            type: type,
            vertexIndex: index,
            scaleEdge: edge,
            startBbox: type === 'scale' ? turf.bbox(editGeometry.current as any) as [number, number, number, number] : undefined,
            startLngLat: [e.lngLat.lng, e.lngLat.lat],
            lastLngLat: undefined,
            startGeometry: JSON.parse(JSON.stringify(editGeometry.current)),
            startCentroid: turf.centroid(editGeometry.current as any).geometry.coordinates as [number, number]
          };
          return;
        }
      }

      // Check if clicking on an annotation body (for translate)
      const annFeatures = map.queryRenderedFeatures(e.point, { layers: ['annotations-fill', 'annotations-line', 'annotations-points'] });

      if (annFeatures.length > 0) {
        const clickedId = annFeatures[0].properties?.id;
        if (clickedId && selectedAnnotationIds.has(clickedId)) {
          e.preventDefault();
          map.dragPan.disable();
          map.getCanvas().style.cursor = 'grabbing';

          if (selectedAnnotationIds.size === 1 && editGeometry.current) {
            dragState.current = {
              isDragging: true,
              type: 'translate',
              startLngLat: [e.lngLat.lng, e.lngLat.lat],
              lastLngLat: undefined,
              startGeometry: JSON.parse(JSON.stringify(editGeometry.current)),
              startCentroid: turf.centroid(editGeometry.current as any).geometry.coordinates as [number, number]
            };
          } else if (selectedAnnotationIds.size > 1) {
            dragState.current = {
              isDragging: true,
              type: 'multi-translate',
              startLngLat: [e.lngLat.lng, e.lngLat.lat],
              lastLngLat: undefined,
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

    const onMouseMove = (e: mapboxgl.MapMouseEvent) => {
      if (activeTool === 'draw_line' || activeTool === 'select_area') {
        updateDrawingSource([e.lngLat.lng, e.lngLat.lat]);
        return;
      }

      if (dragState.current.isDragging) {
        cancelAnimationFrame(animFrameRef.current);
        const currentLngLat: [number, number] = [e.lngLat.lng, e.lngLat.lat];

        animFrameRef.current = requestAnimationFrame(() => {
          const ds = dragState.current;
          const { type, vertexIndex, startLngLat, startGeometry, startCentroid, startGeometries, scaleEdge, startBbox } = ds;

          // Multi-translate: incremental mutation — no clone on each frame
          if (type === 'multi-translate' && startGeometries && startLngLat) {
            const ref = ds.lastLngLat ?? startLngLat;
            const dx = currentLngLat[0] - ref[0];
            const dy = currentLngLat[1] - ref[1];
            multiEditGeometries.current.forEach(item => {
              turf.coordEach(item.geometry as any, coord => { coord[0] += dx; coord[1] += dy; });
            });
            dragState.current.lastLngLat = currentLngLat;
            renderEditHandles();
            return;
          }

          if (!editGeometry.current) return;

          if (type === 'vertex' && vertexIndex !== undefined) {
            // Direct mutation — no clone needed for vertex editing
            const geom = editGeometry.current;
            if (geom.type === 'Polygon') {
              geom.coordinates[0][vertexIndex] = currentLngLat;
              if (vertexIndex === 0) geom.coordinates[0][geom.coordinates[0].length - 1] = currentLngLat;
            } else if (geom.type === 'LineString') {
              (geom as GeoJSON.LineString).coordinates[vertexIndex] = currentLngLat;
            } else if (geom.type === 'Point') {
              (geom as GeoJSON.Point).coordinates = currentLngLat;
            }
          } else if (type === 'translate' && startLngLat) {
            // Incremental mutation — avoids cloning the geometry on every frame
            const ref = ds.lastLngLat ?? startLngLat;
            const dx = currentLngLat[0] - ref[0];
            const dy = currentLngLat[1] - ref[1];
            turf.coordEach(editGeometry.current as any, coord => { coord[0] += dx; coord[1] += dy; });
            dragState.current.lastLngLat = currentLngLat;
          } else if (type === 'scale' && startGeometry && scaleEdge && startBbox) {
            // Directional scale anchored to the opposite edge
            const [minX, minY, maxX, maxY] = startBbox;
            const newGeom = JSON.parse(JSON.stringify(startGeometry));
            if (scaleEdge === 'top') {
              const origH = maxY - minY;
              if (origH !== 0) {
                const factor = (currentLngLat[1] - minY) / origH;
                turf.coordEach(newGeom, coord => { coord[1] = minY + (coord[1] - minY) * factor; });
              }
            } else if (scaleEdge === 'bottom') {
              const origH = maxY - minY;
              if (origH !== 0) {
                const factor = (maxY - currentLngLat[1]) / origH;
                turf.coordEach(newGeom, coord => { coord[1] = maxY - (maxY - coord[1]) * factor; });
              }
            } else if (scaleEdge === 'left') {
              const origW = maxX - minX;
              if (origW !== 0) {
                const factor = (maxX - currentLngLat[0]) / origW;
                turf.coordEach(newGeom, coord => { coord[0] = maxX - (maxX - coord[0]) * factor; });
              }
            } else if (scaleEdge === 'right') {
              const origW = maxX - minX;
              if (origW !== 0) {
                const factor = (currentLngLat[0] - minX) / origW;
                turf.coordEach(newGeom, coord => { coord[0] = minX + (coord[0] - minX) * factor; });
              }
            }
            editGeometry.current = newGeom;
          } else if (type === 'rotate' && startGeometry && startLngLat && startCentroid) {
            const startBearing = turf.bearing(startCentroid, startLngLat);
            const currentBearing = turf.bearing(startCentroid, currentLngLat);
            const angleDelta = currentBearing - startBearing;
            editGeometry.current = turf.transformRotate(turf.feature(startGeometry) as any, angleDelta, { pivot: startCentroid }).geometry;
          }

          renderEditHandles();
        });
        return;
      }

      // Hover cursor feedback when edit handles are visible
      if (activeTool === 'select_multiple' && editGeometry.current) {
        const tolerance = 10;
        const pt = e.point;
        const handleFeatures = map.queryRenderedFeatures(
          [[pt.x - tolerance, pt.y - tolerance], [pt.x + tolerance, pt.y + tolerance]] as [mapboxgl.PointLike, mapboxgl.PointLike],
          { layers: ['edit-handles-vertex', 'edit-handles-scale', 'edit-handles-rotate'] }
        );
        if (handleFeatures.length > 0) {
          const htype = handleFeatures[0].properties?.type;
          const hedge = handleFeatures[0].properties?.edge;
          if (htype === 'vertex') map.getCanvas().style.cursor = 'crosshair';
          else if (htype === 'scale') map.getCanvas().style.cursor = (hedge === 'top' || hedge === 'bottom') ? 'ns-resize' : 'ew-resize';
          else if (htype === 'rotate') map.getCanvas().style.cursor = 'alias';
        } else {
          const bodyFeatures = map.queryRenderedFeatures(pt, { layers: ['annotations-fill', 'annotations-line', 'annotations-points'] });
          const isOnSelected = bodyFeatures.length > 0 && selectedAnnotationIdsRef.current.has(bodyFeatures[0].properties?.id);
          map.getCanvas().style.cursor = isOnSelected ? 'move' : '';
        }
      }
    };

    const onMouseUp = async (e: mapboxgl.MapMouseEvent) => {
      if (dragState.current.isDragging) {
        cancelAnimationFrame(animFrameRef.current);
        map.dragPan.enable();
        map.getCanvas().style.cursor = '';
        
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
        setContextMenu({ x: e.point.x, y: e.point.y, annotationId: features[0].properties.id });
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
          const ann = annotations.find(a => a.id === features[0].properties.id);
          if (ann) setEditingAnnotation(ann);
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
