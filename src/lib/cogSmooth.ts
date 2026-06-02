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

export function smoothImageData(src: ImageData, strength: number): ImageData {
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
  const out = new Uint8ClampedArray(n * 4);
  for (let ci = 0; ci < n; ci++) {
    if (valid[ci]) {
      out[ci * 4] = cur.buf[ci * 4];
      out[ci * 4 + 1] = cur.buf[ci * 4 + 1];
      out[ci * 4 + 2] = cur.buf[ci * 4 + 2];
      out[ci * 4 + 3] = cur.buf[ci * 4 + 3];
    }
  }
  return new ImageData(out, cw, ch);
}
