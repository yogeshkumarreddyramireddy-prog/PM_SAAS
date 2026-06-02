// ─── Smoothed "prescription" view helper ──────────────────────────────────────
//
// Optional, isolated post-processing for the multispectral overlay. Given the
// packed-band ImageData the COG loader produces (RGBA = Green/Red/RedEdge/NIR),
// it block-averages to a coarser grid, applies a small nodata-aware box blur,
// then bilinearly upsamples back to the ORIGINAL resolution — a smooth, de-noised
// "prescription map" surface instead of crisp per-pixel speckle.
//
// Boundary handling is NOT this file's job any more: the rendered image is hard-
// clipped to the vector zones afterwards (see zoneMask.ts), so we only need to
// (a) average data pixels and (b) never let the blur invent data where there was
// none. We keep a nodata mask through the whole pipeline purely so the blur and
// the upsample average ONLY real data — the zone mask then defines the edge.
//
// NDVI is a band RATIO, so scaling the bands preserves the index value; the blur
// just de-noises. Purely a display transform; analysis still reads the raw COG.
// Deleting this file + its call sites fully reverts the smoothing.

export function smoothImageData(src: ImageData, strength: number): ImageData {
  const s = Math.max(0, Math.min(100, strength));
  const factor = Math.max(2, Math.min(4, 2 + Math.floor(s / 40)));   // 2..4 px downsample
  const radius = Math.max(1, Math.min(10, Math.round(s / 9)));        // 1..10 coarse cells blur

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
  const buf = new Float32Array(n * 4);
  const valid = new Uint8Array(n);
  for (let ci = 0; ci < n; ci++) {
    if (cnt[ci] > 0) {
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
  const cBuf = cur.buf, cValid = cur.valid;

  // ── Nodata-aware bilinear upsample back to full resolution ──
  // Sampling the coarse grid with weights that exclude invalid cells avoids
  // darkening toward the boundary; cells with no valid neighbour stay 0 (the
  // zone mask clips them anyway).
  const out = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++) {
    const fy = (y / factor) - 0.5;
    let cy0 = Math.floor(fy); const ty = fy - cy0;
    let cy1 = cy0 + 1;
    if (cy0 < 0) cy0 = 0; if (cy1 < 0) cy1 = 0;
    if (cy0 > ch - 1) cy0 = ch - 1; if (cy1 > ch - 1) cy1 = ch - 1;
    for (let x = 0; x < W; x++) {
      const fx = (x / factor) - 0.5;
      let cx0 = Math.floor(fx); const tx = fx - cx0;
      let cx1 = cx0 + 1;
      if (cx0 < 0) cx0 = 0; if (cx1 < 0) cx1 = 0;
      if (cx0 > cw - 1) cx0 = cw - 1; if (cx1 > cw - 1) cx1 = cw - 1;

      const i00 = cy0 * cw + cx0, i10 = cy0 * cw + cx1;
      const i01 = cy1 * cw + cx0, i11 = cy1 * cw + cx1;
      const w00 = (1 - tx) * (1 - ty) * cValid[i00];
      const w10 = tx * (1 - ty) * cValid[i10];
      const w01 = (1 - tx) * ty * cValid[i01];
      const w11 = tx * ty * cValid[i11];
      const wsum = w00 + w10 + w01 + w11;
      const o = (y * W + x) * 4;
      if (wsum > 0) {
        const inv = 1 / wsum;
        out[o]     = (cBuf[i00 * 4]     * w00 + cBuf[i10 * 4]     * w10 + cBuf[i01 * 4]     * w01 + cBuf[i11 * 4]     * w11) * inv;
        out[o + 1] = (cBuf[i00 * 4 + 1] * w00 + cBuf[i10 * 4 + 1] * w10 + cBuf[i01 * 4 + 1] * w01 + cBuf[i11 * 4 + 1] * w11) * inv;
        out[o + 2] = (cBuf[i00 * 4 + 2] * w00 + cBuf[i10 * 4 + 2] * w10 + cBuf[i01 * 4 + 2] * w01 + cBuf[i11 * 4 + 2] * w11) * inv;
        out[o + 3] = (cBuf[i00 * 4 + 3] * w00 + cBuf[i10 * 4 + 3] * w10 + cBuf[i01 * 4 + 3] * w01 + cBuf[i11 * 4 + 3] * w11) * inv;
      }
    }
  }
  return new ImageData(out, W, H);
}
