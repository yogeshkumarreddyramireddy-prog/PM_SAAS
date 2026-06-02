// ─── Smoothed "prescription" view helper ──────────────────────────────────────
//
// Optional, isolated post-processing for the multispectral overlay. Given the
// packed-band ImageData the COG loader produces (RGBA = Green/Red/RedEdge/NIR),
// it block-averages to a coarser grid and applies a small nodata-aware box blur,
// returning a SMALLER ImageData. Rendered with LINEAR texture filtering, the GPU
// bilinearly upscales it into a smooth, de-noised surface — the "prescription
// map" look — instead of crisp per-pixel speckle.
//
// Notes:
//  • A pixel is nodata when all four channels are 0 (the masked field margin).
//    We average ONLY data pixels so the boundary never bleeds, and leave nodata
//    cells at 0 so the shader keeps them transparent.
//  • NDVI is a band RATIO, so scaling the bands toward 0 at the edge (from LINEAR
//    interpolation into nodata) preserves the NDVI value until it fades out — no
//    coloured halo.
//  • Purely a display transform; analysis (zonal stats, pixel inspector) still
//    reads the raw COG. Deleting this file + its call sites fully reverts it.

// ─── Vector-zone clipping ─────────────────────────────────────────────────────
//
// The smoothed surface is clipped to the uploaded vector-zone polygons so it
// never renders outside the zones and gets clean vector edges (instead of the
// COG's jagged footprint). We do this in plain JS at the (coarse) output grid —
// rasterising the polygons by point-in-polygon — rather than via a GPU
// MaskExtension, which did not render in Mapbox's interleaved overlay mode and
// blanked the whole surface.

export interface ClipPoly {
  outer: [number, number][];
  holes: [number, number][][];
  bbox: [number, number, number, number]; // [minLng, minLat, maxLng, maxLat]
}

// Flatten a GeoJSON FeatureCollection (WGS84) into a list of polygons, each with
// its outer ring, holes and bounding box. MultiPolygons expand to one entry per
// sub-polygon. Returns null when there's nothing to clip to.
export function buildClipPolys(fc: any): ClipPoly[] | null {
  if (!fc || !Array.isArray(fc.features) || fc.features.length === 0) return null;
  const out: ClipPoly[] = [];
  const addPoly = (rings: any[]) => {
    if (!Array.isArray(rings) || rings.length === 0) return;
    const outer = rings[0] as [number, number][];
    if (!Array.isArray(outer) || outer.length < 3) return;
    let minLng = Infinity, minLat = Infinity, maxLng = -Infinity, maxLat = -Infinity;
    for (const [lng, lat] of outer) {
      if (lng < minLng) minLng = lng; if (lng > maxLng) maxLng = lng;
      if (lat < minLat) minLat = lat; if (lat > maxLat) maxLat = lat;
    }
    out.push({ outer, holes: rings.slice(1) as [number, number][][], bbox: [minLng, minLat, maxLng, maxLat] });
  };
  for (const f of fc.features) {
    const g = f?.geometry;
    if (!g) continue;
    if (g.type === 'Polygon') addPoly(g.coordinates);
    else if (g.type === 'MultiPolygon') for (const poly of g.coordinates) addPoly(poly);
  }
  return out.length ? out : null;
}

// Ray-casting point-in-ring test.
function pointInRing(lng: number, lat: number, ring: [number, number][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1];
    if (((yi > lat) !== (yj > lat)) && (lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi)) inside = !inside;
  }
  return inside;
}

function pointInPolys(lng: number, lat: number, polys: ClipPoly[]): boolean {
  for (const p of polys) {
    const b = p.bbox;
    if (lng < b[0] || lng > b[2] || lat < b[1] || lat > b[3]) continue; // bbox reject
    if (!pointInRing(lng, lat, p.outer)) continue;
    let inHole = false;
    for (const h of p.holes) { if (pointInRing(lng, lat, h)) { inHole = true; break; } }
    if (!inHole) return true;
  }
  return false;
}

export interface SmoothClip {
  bounds: [number, number, number, number]; // [minLng, minLat, maxLng, maxLat]
  polys: ClipPoly[];
}

export function smoothImageData(src: ImageData, strength: number, clip?: SmoothClip): ImageData {
  const s = Math.max(0, Math.min(100, strength));
  // Smoothness comes mostly from the blur RADIUS (which no longer grows the shape,
  // since the output is clipped to the footprint), so keep the downsample factor
  // small to preserve detail and minimise edge erosion, and let the radius scale.
  const factor = Math.max(2, Math.min(4, 2 + Math.floor(s / 40)));   // 2..4 px
  const radius = Math.max(1, Math.min(10, Math.round(s / 9)));        // 1..10 coarse cells

  const W = src.width, H = src.height, data = src.data;
  const cw = Math.max(1, Math.ceil(W / factor));
  const ch = Math.max(1, Math.ceil(H / factor));
  const n = cw * ch;

  // ── Downsample: block-average data pixels (skip all-zero nodata) ──
  const acc = new Float32Array(n * 4);
  const cnt = new Float32Array(n);
  for (let y = 0; y < H; y++) {
    const cy = (y / factor) | 0;
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      const r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3];
      if (r === 0 && g === 0 && b === 0 && a === 0) continue; // nodata
      const ci = cy * cw + ((x / factor) | 0);
      acc[ci * 4] += r; acc[ci * 4 + 1] += g; acc[ci * 4 + 2] += b; acc[ci * 4 + 3] += a;
      cnt[ci]++;
    }
  }
  // A coarse cell counts as "field" only if it's at least ~1/3 covered by data.
  // This keeps the footprint from growing outward at the boundary (a cell that
  // barely clips the field edge is dropped, not promoted to a full data cell).
  const minCov = Math.max(1, Math.round(factor * factor * 0.34));
  const buf = new Float32Array(n * 4);
  const valid = new Uint8Array(n);
  for (let ci = 0; ci < n; ci++) {
    if (cnt[ci] >= minCov) {
      valid[ci] = 1;
      buf[ci * 4] = acc[ci * 4] / cnt[ci];
      buf[ci * 4 + 1] = acc[ci * 4 + 1] / cnt[ci];
      buf[ci * 4 + 2] = acc[ci * 4 + 2] / cnt[ci];
      buf[ci * 4 + 3] = acc[ci * 4 + 3] / cnt[ci];
    }
  }

  // ── Nodata-aware separable box blur (2 passes ≈ Gaussian) ──
  const blurPass = (inBuf: Float32Array, inValid: Uint8Array) => {
    const tBuf = new Float32Array(n * 4), tValid = new Uint8Array(n);
    // horizontal
    for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) {
      let s0 = 0, s1 = 0, s2 = 0, s3 = 0, w = 0;
      for (let k = -radius; k <= radius; k++) {
        const xx = x + k; if (xx < 0 || xx >= cw) continue;
        const ci = y * cw + xx; if (!inValid[ci]) continue;
        s0 += inBuf[ci * 4]; s1 += inBuf[ci * 4 + 1]; s2 += inBuf[ci * 4 + 2]; s3 += inBuf[ci * 4 + 3]; w++;
      }
      const o = y * cw + x;
      if (w > 0) { tValid[o] = 1; tBuf[o * 4] = s0 / w; tBuf[o * 4 + 1] = s1 / w; tBuf[o * 4 + 2] = s2 / w; tBuf[o * 4 + 3] = s3 / w; }
    }
    const oBuf = new Float32Array(n * 4), oValid = new Uint8Array(n);
    // vertical
    for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) {
      let s0 = 0, s1 = 0, s2 = 0, s3 = 0, w = 0;
      for (let k = -radius; k <= radius; k++) {
        const yy = y + k; if (yy < 0 || yy >= ch) continue;
        const ci = yy * cw + x; if (!tValid[ci]) continue;
        s0 += tBuf[ci * 4]; s1 += tBuf[ci * 4 + 1]; s2 += tBuf[ci * 4 + 2]; s3 += tBuf[ci * 4 + 3]; w++;
      }
      const o = y * cw + x;
      if (w > 0) { oValid[o] = 1; oBuf[o * 4] = s0 / w; oBuf[o * 4 + 1] = s1 / w; oBuf[o * 4 + 2] = s2 / w; oBuf[o * 4 + 3] = s3 / w; }
    }
    return { buf: oBuf, valid: oValid };
  };
  let cur = blurPass(buf, valid);
  cur = blurPass(cur.buf, cur.valid);

  // ── Pack to ImageData ──
  // CRITICAL: gate on the ORIGINAL footprint (`valid`), not the post-blur
  // validity. The nodata-aware blur deliberately spreads values into neighbours,
  // which would otherwise grow the field outward by ~2×radius cells (the "fills
  // the whole map at high smoothing" bug). Smoothing the values is fine; growing
  // the shape is not — so we keep blurred values only where there was real data.
  // Optional vector-zone clip: a coarse cell is kept only if its centre falls
  // inside one of the zone polygons. `bounds` = [w, s, e, n] in WGS84; ImageData
  // row 0 is the NORTH edge, so latitude decreases with y.
  const clipPolys = clip && clip.polys.length ? clip.polys : null;
  const w0 = clip ? clip.bounds[0] : 0, s0 = clip ? clip.bounds[1] : 0;
  const e0 = clip ? clip.bounds[2] : 0, n0 = clip ? clip.bounds[3] : 0;
  const lngSpan = e0 - w0, latSpan = n0 - s0;

  const out = new Uint8ClampedArray(n * 4);
  for (let ci = 0; ci < n; ci++) {
    if (!valid[ci]) continue;
    if (clipPolys) {
      const cx = ci % cw, cy = (ci / cw) | 0;
      const lng = w0 + ((cx + 0.5) / cw) * lngSpan;
      const lat = n0 - ((cy + 0.5) / ch) * latSpan;
      if (!pointInPolys(lng, lat, clipPolys)) continue; // outside zones → transparent
    }
    out[ci * 4] = cur.buf[ci * 4];
    out[ci * 4 + 1] = cur.buf[ci * 4 + 1];
    out[ci * 4 + 2] = cur.buf[ci * 4 + 2];
    out[ci * 4 + 3] = cur.buf[ci * 4 + 3];
  }
  return new ImageData(out, cw, ch);
}
