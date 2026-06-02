// ─── Smoothed "prescription" view helper ──────────────────────────────────────
//
// Optional, isolated post-processing for the multispectral overlay. Given the
// packed-band ImageData the COG loader produces (RGBA = Green/Red/RedEdge/NIR)
// plus the image's geographic bounds, it applies a nodata-aware box blur whose
// radius is a FIXED GROUND DISTANCE (metres) derived from the slider — NOT a
// pixel count. That makes the smoothing zoom-invariant: the base (full-extent,
// coarse) image and the window (viewport, high-res) image have very different
// pixel resolutions, and the window's resolution changes with zoom, so a fixed
// PIXEL radius would cover a different amount of ground at every zoom and the
// smoothing would appear to grow/shrink. Converting the radius to pixels per
// image keeps the on-ground smoothing constant — it only changes with the slider.
//
// No downsampling: we blur at full resolution and return a full-resolution image,
// so nothing is resampled based on zoom. A sliding-window (prefix-sum) box blur
// keeps the cost O(W·H) regardless of how large the pixel radius gets.
//
// Boundary handling is NOT this file's job: the rendered image is hard-clipped to
// the vector zones afterwards (see zoneMask.ts). We keep a nodata mask only so the
// blur averages real data and never bleeds the field margin inward.
//
// NDVI is a band RATIO, so blurring the bands just de-noises the index. Purely a
// display transform; analysis still reads the raw COG. Deleting this file + its
// call sites fully reverts the smoothing.

// Slider 0..100 → blur radius in METRES on the ground. Tuned for turf/greens:
// subtle at the low end, strongly de-noised ("prescription map") at the top.
function strengthToMetres(strength: number): number {
  const s = Math.max(0, Math.min(100, strength));
  return 0.3 + (s / 100) * 7.7; // ~0.3 m … ~8 m
}

// One separable box-blur pass over a Float32 RGBA buffer + validity mask, using
// per-line prefix sums so the window average is O(1) per pixel (radius-free).
// `horizontal` selects the axis. Only valid samples contribute; an output pixel
// is valid if its window contained ≥1 valid sample.
function boxPass(
  buf: Float32Array, valid: Uint8Array,
  W: number, H: number, radius: number, horizontal: boolean,
): { buf: Float32Array; valid: Uint8Array } {
  const outBuf = new Float32Array(W * H * 4);
  const outValid = new Uint8Array(W * H);
  const lineLen = horizontal ? W : H;
  const lines = horizontal ? H : W;
  // Prefix arrays sized for one line (+1).
  const p0 = new Float64Array(lineLen + 1);
  const p1 = new Float64Array(lineLen + 1);
  const p2 = new Float64Array(lineLen + 1);
  const p3 = new Float64Array(lineLen + 1);
  const pc = new Float64Array(lineLen + 1);

  for (let l = 0; l < lines; l++) {
    // Build prefix sums along the line.
    for (let k = 0; k < lineLen; k++) {
      const idx = horizontal ? (l * W + k) : (k * W + l);
      const v = valid[idx];
      const o = idx * 4;
      p0[k + 1] = p0[k] + (v ? buf[o] : 0);
      p1[k + 1] = p1[k] + (v ? buf[o + 1] : 0);
      p2[k + 1] = p2[k] + (v ? buf[o + 2] : 0);
      p3[k + 1] = p3[k] + (v ? buf[o + 3] : 0);
      pc[k + 1] = pc[k] + (v ? 1 : 0);
    }
    for (let k = 0; k < lineLen; k++) {
      let lo = k - radius; if (lo < 0) lo = 0;
      let hi = k + radius; if (hi > lineLen - 1) hi = lineLen - 1;
      const cnt = pc[hi + 1] - pc[lo];
      const idx = horizontal ? (l * W + k) : (k * W + l);
      const o = idx * 4;
      if (cnt > 0) {
        const inv = 1 / cnt;
        outBuf[o] = (p0[hi + 1] - p0[lo]) * inv;
        outBuf[o + 1] = (p1[hi + 1] - p1[lo]) * inv;
        outBuf[o + 2] = (p2[hi + 1] - p2[lo]) * inv;
        outBuf[o + 3] = (p3[hi + 1] - p3[lo]) * inv;
        outValid[idx] = 1;
      }
    }
  }
  return { buf: outBuf, valid: outValid };
}

export function smoothImageData(
  src: ImageData,
  strength: number,
  bounds: [number, number, number, number],
): ImageData {
  const W = src.width, H = src.height, data = src.data;
  const [w, s, e, n] = bounds;

  // Ground resolution of THIS image (metres per pixel), so the metre-radius blur
  // becomes the right pixel radius regardless of which overview/zoom produced it.
  const latMid = (s + n) / 2;
  const mppX = (Math.abs(e - w) * 111320 * Math.cos((latMid * Math.PI) / 180)) / Math.max(1, W);
  const mppY = (Math.abs(n - s) * 110540) / Math.max(1, H);
  const radiusM = strengthToMetres(strength);
  // Two box iterations ≈ Gaussian; split the radius so the combined blur ≈ radiusM.
  let rx = Math.max(1, Math.round(radiusM / Math.max(1e-6, mppX) / 2));
  let ry = Math.max(1, Math.round(radiusM / Math.max(1e-6, mppY) / 2));
  rx = Math.min(rx, W);
  ry = Math.min(ry, H);

  // Source → Float buffer + validity (all-zero RGBA = nodata margin).
  let buf = new Float32Array(W * H * 4);
  let valid = new Uint8Array(W * H);
  for (let p = 0, i = 0; p < W * H; p++, i += 4) {
    const r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3];
    if (r === 0 && g === 0 && b === 0 && a === 0) continue;
    buf[i] = r; buf[i + 1] = g; buf[i + 2] = b; buf[i + 3] = a;
    valid[p] = 1;
  }

  // 2 iterations of separable box blur (H then V).
  for (let it = 0; it < 2; it++) {
    let res = boxPass(buf, valid, W, H, rx, true);
    res = boxPass(res.buf, res.valid, W, H, ry, false);
    buf = res.buf; valid = res.valid;
  }

  // Pack to full-resolution ImageData (nodata stays 0 → shader/zone-mask drop it).
  const out = new Uint8ClampedArray(W * H * 4);
  for (let p = 0, i = 0; p < W * H; p++, i += 4) {
    if (valid[p]) {
      out[i] = buf[i]; out[i + 1] = buf[i + 1]; out[i + 2] = buf[i + 2]; out[i + 3] = buf[i + 3];
    }
  }
  return new ImageData(out, W, H);
}
