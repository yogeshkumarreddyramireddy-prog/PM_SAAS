import type mapboxgl from 'mapbox-gl';

const SWIPE_ELIGIBLE_PREFIXES = ['tileset-layer-', 'health-map-layer-'] as const;

const VECTOR_SUFFIXES = ['', '-outline', '-line', '-point', '-label'] as const;

const isSwipeEligible = (id: string) =>
  SWIPE_ELIGIBLE_PREFIXES.some(p => id.startsWith(p));

const setVisibility = (
  map: mapboxgl.Map,
  layerId: string,
  visibility: 'visible' | 'none'
) => {
  if (!map.getLayer(layerId)) return;
  try {
    const current = map.getLayoutProperty(layerId, 'visibility') || 'visible';
    if (current !== visibility) {
      map.setLayoutProperty(layerId, 'visibility', visibility);
    }
  } catch (e) {
    console.warn(`[swipe] failed to set ${layerId} → ${visibility}:`, e);
  }
};

/**
 * Apply swipe visibility to a Mapbox map: show only `targetLayerId` among
 * raster/health layers and hide every vector layer family. Vector layers are
 * fully suppressed during swipe — restoration is the caller's responsibility
 * (re-run the normal sync routines on swipe exit).
 */
export const applySwipeVisibility = (
  map: mapboxgl.Map | null,
  targetLayerId: string | null
) => {
  if (!map || !map.isStyleLoaded()) return;

  const style = map.getStyle();
  if (!style?.layers) return;

  for (const layer of style.layers) {
    const id = layer.id;

    if (isSwipeEligible(id)) {
      setVisibility(map, id, id === targetLayerId ? 'visible' : 'none');
      continue;
    }

    if (id.startsWith('vector-layer-')) {
      setVisibility(map, id, 'none');
    }
  }
};

/** Hide every variant of a vector layer (base, outline, line, point, label). */
export const hideVectorLayerFamily = (
  map: mapboxgl.Map | null,
  vectorLayerBaseId: string
) => {
  if (!map || !map.isStyleLoaded()) return;
  for (const suffix of VECTOR_SUFFIXES) {
    setVisibility(map, `${vectorLayerBaseId}${suffix}`, 'none');
  }
};
