const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, 'src/hooks/useDrawingManager.ts');
let content = fs.readFileSync(file, 'utf8');

// 1. Add historyLength state
content = content.replace(
  `  const editHistory = useRef<{ annotationId: string, geometry: GeoJSON.Geometry }[]>([]);`,
  `  const editHistory = useRef<{ annotationId: string, geometry: GeoJSON.Geometry }[]>([]);\n  const [historyLength, setHistoryLength] = useState(0);`
);

// 2. Fix the map filter useEffect. We will just use `selectedAnnotationIds` as the dependency, since editAnnotationId changes when selectedAnnotationIds changes.
content = content.replace(
  `  useEffect(() => {
    if (!map) return;
    const currentEditId = editAnnotationId.current || '';
    if (map.getLayer('annotations-fill')) {
      map.setFilter('annotations-fill', ['all', ['==', '$type', 'Polygon'], ['!=', 'id', currentEditId]]);
      map.setFilter('annotations-line', ['all', ['in', '$type', 'LineString', 'Polygon'], ['!=', 'id', currentEditId]]);
      map.setFilter('annotations-points', ['all', ['==', '$type', 'Point'], ['!=', 'id', currentEditId]]);
    }
  }, [editAnnotationId.current, map]);`,
  `  useEffect(() => {
    if (!map) return;
    const currentEditId = (selectedAnnotationIds.size === 1 && activeTool === 'select_multiple') ? Array.from(selectedAnnotationIds)[0] : '';
    if (map.getLayer('annotations-fill')) {
      map.setFilter('annotations-fill', ['all', ['==', '$type', 'Polygon'], ['!=', 'id', currentEditId]]);
      map.setFilter('annotations-line', ['all', ['in', '$type', 'LineString', 'Polygon'], ['!=', 'id', currentEditId]]);
      map.setFilter('annotations-points', ['all', ['==', '$type', 'Point'], ['!=', 'id', currentEditId]]);
    }
  }, [selectedAnnotationIds, activeTool, map]);`
);

// 3. Fix snapping back - Ensure `newGeom` doesn't have a bbox that causes Supabase to reject.
// Also update setHistoryLength in onMouseUp.
const mouseUpOld = `    const onMouseUp = async () => {
      if (dragState.current.isDragging) {
        map.dragPan.enable();
        
        if (editAnnotationId.current && editGeometry.current && dragState.current.startGeometry) {
          // Push to history
          editHistory.current.push({
            annotationId: editAnnotationId.current,
            geometry: dragState.current.startGeometry
          });

          // Optimistic UI Update
          const newGeom = editGeometry.current;
          const id = editAnnotationId.current;
          setAnnotations(prev => prev.map(a => a.id === id ? { ...a, geometry: newGeom } : a));

          try {
             await annotationService.updateAnnotation(id, { geometry: newGeom });
             await loadAnnotations(); // refresh from db eventually
          } catch (err) {
             console.error('Failed to save edit', err);
             await loadAnnotations(); // revert on fail
          }
        }
        
        setTimeout(() => {
           dragState.current = { isDragging: false, type: null };
        }, 100);
      }
    };`;

const mouseUpNew = `    const onMouseUp = async () => {
      if (dragState.current.isDragging) {
        map.dragPan.enable();
        
        if (editAnnotationId.current && editGeometry.current && dragState.current.startGeometry) {
          editHistory.current.push({
            annotationId: editAnnotationId.current,
            geometry: dragState.current.startGeometry
          });
          setHistoryLength(editHistory.current.length);

          const newGeom = editGeometry.current;
          delete (newGeom as any).bbox; // Prevent Supabase PostGIS errors
          const id = editAnnotationId.current;
          
          setAnnotations(prev => prev.map(a => a.id === id ? { ...a, geometry: newGeom } : a));

          try {
             await annotationService.updateAnnotation(id, { geometry: newGeom });
             // We omit loadAnnotations here to avoid race conditions overriding optimistic UI.
          } catch (err) {
             console.error('Failed to save edit', err);
             await loadAnnotations(); 
          }
        }
        
        setTimeout(() => {
           dragState.current = { isDragging: false, type: null };
        }, 100);
      }
    };`;
content = content.replace(mouseUpOld, mouseUpNew);

// 4. Update undoLastEdit to also call setHistoryLength
const undoOld = `    // Update currently editing geometry if it's the one we just undid
    if (editAnnotationId.current === lastEdit.annotationId) {
       editGeometry.current = lastEdit.geometry;
       renderEditHandles();
    }

    try {
      await annotationService.updateAnnotation(lastEdit.annotationId, { geometry: lastEdit.geometry });
      await loadAnnotations();
    } catch (err) {
      console.error("Failed to undo", err);
    }`;

const undoNew = `    setHistoryLength(editHistory.current.length);
    if (editAnnotationId.current === lastEdit.annotationId) {
       editGeometry.current = lastEdit.geometry;
       renderEditHandles();
    }

    try {
      await annotationService.updateAnnotation(lastEdit.annotationId, { geometry: lastEdit.geometry });
    } catch (err) {
      console.error("Failed to undo", err);
    }`;
content = content.replace(undoOld, undoNew);

// 5. Update canUndo export
content = content.replace(
  `canUndo: editHistory.current.length > 0`,
  `canUndo: historyLength > 0`
);

// 6. Keyboard listener for Delete/Backspace
const keyboardListener = `  // Keyboard listener for Delete
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
  }, [selectedAnnotationIds]);`;

content = content.replace(
  `  // Map interaction events`,
  keyboardListener + `\n\n  // Map interaction events`
);

fs.writeFileSync(file, content);
console.log('useDrawingManager patched');
