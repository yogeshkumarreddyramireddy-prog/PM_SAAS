// ─── Vector-zone clipping for the multispectral overlay ───────────────────────
//
// The uploaded multispectral COG is clipped to the vector zones in QGIS, but its
// overview pyramids (the downsampled copies used when zoomed out) are built by
// AVERAGING pixels. At the zone boundary an overview pixel blends real data with
// the nodata margin, producing a small non-zero value that the shader still
// paints — a blocky fringe that grows OUTSIDE the polygons.
//
// Rather than trust the COG's own nodata, we clip every rendered multispectral
// image to the vector-zone polygons ourselves: rasterise the polygons (hard,
// scanline fill) into a mask at the image's own resolution and geographic
// bounds, then zero RGBA wherever the mask is empty. The VegetationIndexLayer
// shader already renders all-zero pixels transparent (`total > 0.0001`), so the
// result is exactly the QGIS clip — nothing renders outside the zones, edges
// follow the vectors. Resolution-independent: works the same for the coarse base
// overview and the high-res window. Purely a display transform; analysis still
// reads the raw COG.

export interface ClipPoly {
  // rings[0] = outer ring, rings[1..] = holes. Each ring is [lng, lat][].
  rings: [number, number][][];
  bbox: [number, number, number, number]; // [minLng, minLat, maxLng, maxLat]
}

// Flatten a GeoJSON FeatureCollection (WGS84) into polygons. MultiPolygons
// expand to one entry per sub-polygon. Returns null when there's nothing to
// clip to (→ caller leaves the image untouched / falls back to nodata).
export function buildClipPolys(fc: any): ClipPoly[] | null {
  if (!fc || !Array.isArray(fc.features) || fc.features.length === 0) return null;
  const out: ClipPoly[] = [];
  const addPoly = (rings: any[]) => {
    if (!Array.isArray(rings) || rings.length === 0) return;
    const outer = rings[0];
    if (!Array.isArray(outer) || outer.length < 3) return;
    let minLng = Infinity, minLat = Infinity, maxLng = -Infinity, maxLat = -Infinity;
    for (const [lng, lat] of outer) {
      if (lng < minLng) minLng = lng; if (lng > maxLng) maxLng = lng;
      if (lat < minLat) minLat = lat; if (lat > maxLat) maxLat = lat;
    }
    out.push({ rings: rings as [number, number][][], bbox: [minLng, minLat, maxLng, maxLat] });
  };
  for (const f of fc.features) {
    const g = f?.geometry;
    if (!g) continue;
    if (g.type === 'Polygon') addPoly(g.coordinates);
    else if (g.type === 'MultiPolygon') for (const poly of g.coordinates) addPoly(poly);
  }
  return out.length ? out : null;
}

// Stable key for a polygon set, so the rasterised mask can be cached.
export function clipPolysKey(polys: ClipPoly[]): string {
  // Polygon count + total vertex count + first/last vertex is enough to detect a
  // different zone set without hashing every coordinate.
  let verts = 0;
  for (const p of polys) for (const r of p.rings) verts += r.length;
  const first = polys[0]?.rings[0]?.[0] ?? [0, 0];
  const last = polys[polys.length - 1]?.rings[0]?.[0] ?? [0, 0];
  return `n${polys.length}v${verts}_${first[0].toFixed(5)},${first[1].toFixed(5)}_${last[0].toFixed(5)},${last[1].toFixed(5)}`;
}

// ── Hard scanline rasterisation ───────────────────────────────────────────────
// Returns a W×H Uint8Array, 1 inside the zones, 0 outside. `bounds` = [w,s,e,n]
// in WGS84; ImageData row 0 is the NORTH edge, so latitude decreases with y.
// Each polygon is filled with the even-odd rule across its own rings (so holes
// are cut out correctly), then OR-ed into the mask (so overlapping zones union
// instead of cancelling).
function rasterizeMask(
  W: number, H: number,
  bounds: [number, number, number, number],
  polys: ClipPoly[],
): Uint8Array {
  const mask = new Uint8Array(W * H);
  const [w, s, e, n] = bounds;
  const lngSpan = e - w || 1e-9;
  const latSpan = n - s || 1e-9;
  const xs: number[] = [];

  for (let py = 0; py < H; py++) {
    const lat = n - ((py + 0.5) / H) * latSpan; // row centre latitude
    const rowBase = py * W;
    for (const poly of polys) {
      if (lat < poly.bbox[1] || lat > poly.bbox[3]) continue; // bbox reject by row
      xs.length = 0;
      for (const ring of poly.rings) {
        for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
          const ya = ring[i][1], yb = ring[j][1];
          if ((ya > lat) !== (yb > lat)) {
            const xa = ring[i][0], xb = ring[j][0];
            const lng = xa + ((lat - ya) / (yb - ya)) * (xb - xa);
            xs.push(((lng - w) / lngSpan) * W); // fractional pixel x
          }
        }
      }
      if (xs.length < 2) continue;
      xs.sort((a, b) => a - b);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        // Fill pixels whose centre (px+0.5) lies within the span.
        let start = Math.ceil(xs[k] - 0.5);
        let end = Math.floor(xs[k + 1] - 0.5);
        if (start < 0) start = 0;
        if (end > W - 1) end = W - 1;
        for (let px = start; px <= end; px++) mask[rowBase + px] = 1;
      }
    }
  }
  return mask;
}

// Small LRU-ish cache so panning/zooming doesn't re-rasterise the same view.
const maskCache = new Map<string, Uint8Array>();
function getMask(
  W: number, H: number,
  bounds: [number, number, number, number],
  polys: ClipPoly[],
  polysKey: string,
): Uint8Array {
  const key = `${W}x${H}|${bounds.map(b => b.toFixed(6)).join(',')}|${polysKey}`;
  const hit = maskCache.get(key);
  if (hit) return hit;
  const mask = rasterizeMask(W, H, bounds, polys);
  if (maskCache.size > 12) maskCache.delete(maskCache.keys().next().value as string);
  maskCache.set(key, mask);
  return mask;
}

// Return a COPY of `img` with every pixel outside the zones zeroed (→ the shader
// renders them transparent). Never mutates the source (it's the cached raw COG).
export function applyZoneMask(
  img: ImageData,
  bounds: [number, number, number, number],
  polys: ClipPoly[],
  polysKey: string,
): ImageData {
  const W = img.width, H = img.height;
  const mask = getMask(W, H, bounds, polys, polysKey);
  const out = new Uint8ClampedArray(img.data); // copy
  for (let i = 0, p = 0; p < mask.length; p++, i += 4) {
    if (mask[p] === 0) { out[i] = 0; out[i + 1] = 0; out[i + 2] = 0; out[i + 3] = 0; }
  }
  return new ImageData(out, W, H);
}
