export type VegetationIndex =
  | 'RGB_GLI' | 'RGB_VARI' | 'RGB_TGI' | 'RGB_GRVI'
  | 'MS_NDVI' | 'MS_NDRE' | 'MS_GNDVI' | 'MS_MSAVI2' | 'MS_OSAVI' | 'MS_NDWI' | 'MS_CLRE';

export interface VegetationIndexInfo {
  id: VegetationIndex;
  name: string;
  category: 'RGB' | 'Multispectral';
  shaderMath: string;
  calculate: (r: number, g: number, b: number, n: number, e: number) => number;
  domain: [number, number];
  // Absolute, agronomically-meaningful range the colour ramp (red→green) is
  // applied over by DEFAULT. The map is NOT auto-stretched to each image's
  // min/max — that made healthy values (e.g. NDVI 0.72) render red just because
  // they were the lowest in that particular image. With a fixed range the colour
  // is consistent: low end = stressed/bare (red), high end = healthy (green).
  // The user can still drag the slider to override it.
  colorRange: [number, number];
}

export const VEGETATION_INDEX_CONFIG: Record<VegetationIndex, VegetationIndexInfo> = {
  'RGB_GLI': {
    id: 'RGB_GLI',
    name: 'GLI (Green Leaf Index)',
    category: 'RGB',
    shaderMath: '(2.0 * g - r - b) / (2.0 * g + r + b + 0.000001)',
    calculate: (r, g, b) => (2 * g - r - b) / (2 * g + r + b + 0.000001),
    domain: [-0.5, 0.5],
    colorRange: [-0.05, 0.3]
  },
  'RGB_VARI': {
    id: 'RGB_VARI',
    name: 'VARI (Visible Atmospherically Resistant Index)',
    category: 'RGB',
    shaderMath: '(g - r) / (g + r - b + 0.000001)',
    calculate: (r, g, b) => (g - r) / (g + r - b + 0.000001),
    domain: [-0.5, 0.5],
    colorRange: [-0.05, 0.35]
  },
  'RGB_TGI': {
    id: 'RGB_TGI',
    name: 'TGI (Triangular Greenness Index)',
    category: 'RGB',
    shaderMath: 'g - 0.39 * r - 0.61 * b',
    calculate: (r, g, b) => g - 0.39 * r - 0.61 * b,
    domain: [-0.5, 0.5],
    colorRange: [-0.1, 0.2]
  },
  'RGB_GRVI': {
    id: 'RGB_GRVI',
    name: 'GRVI (Green-Red Vegetation Index)',
    category: 'RGB',
    shaderMath: '(g - r) / (g + r + 0.000001)',
    calculate: (r, g) => (g - r) / (g + r + 0.000001),
    domain: [-0.5, 0.5],
    colorRange: [-0.05, 0.3]
  },
  'MS_NDVI': {
    id: 'MS_NDVI',
    name: 'NDVI (Normalized Difference Vegetation Index)',
    category: 'Multispectral',
    shaderMath: '(n - r) / (n + r + 0.000001)',
    calculate: (r, g, b, n) => (n - r) / (n + r + 0.000001),
    domain: [-1, 1],
    // Bare/dead <0.2 (red) … sparse 0.4 (yellow) … dense healthy ≥0.85 (green).
    colorRange: [0.2, 0.85]
  },
  'MS_NDRE': {
    id: 'MS_NDRE',
    // Barnes et al. (2000) — NDRE = (NIR - RedEdge) / (NIR + RedEdge)
    // Theoretical range: [-1, 1]. Healthy vegetation: ~0.20–0.45.
    // RedEdge band (~710–730 nm) is sensitive to chlorophyll concentration.
    name: 'NDRE (Normalized Difference Red Edge)',
    category: 'Multispectral',
    shaderMath: '(n - e) / (n + e + 0.000001)',
    calculate: (r, g, b, n, e) => (n - e) / (n + e + 0.000001),
    domain: [-1, 1],
    colorRange: [0.05, 0.45]
  },
  'MS_GNDVI': {
    id: 'MS_GNDVI',
    name: 'GNDVI (Green NDVI)',
    category: 'Multispectral',
    shaderMath: '(n - g) / (n + g + 0.000001)',
    calculate: (r, g, b, n) => (n - g) / (n + g + 0.000001),
    domain: [-1, 1],
    colorRange: [0.2, 0.85]
  },
  'MS_MSAVI2': {
    id: 'MS_MSAVI2',
    name: 'MSAVI2 (Modified Soil Adjusted Vegetation Index)',
    category: 'Multispectral',
    shaderMath: '(2.0 * n + 1.0 - sqrt(pow(2.0 * n + 1.0, 2.0) - 8.0 * (n - r))) / 2.0',
    calculate: (r, g, b, n) => (2 * n + 1 - Math.sqrt(Math.pow(2 * n + 1, 2) - 8 * (n - r))) / 2,
    domain: [-1, 1],
    colorRange: [0.2, 0.8]
  },
  'MS_OSAVI': {
    id: 'MS_OSAVI',
    name: 'OSAVI (Optimized Soil Adjusted Vegetation Index)',
    category: 'Multispectral',
    shaderMath: '(n - r) / (n + r + 0.16)',
    calculate: (r, g, b, n) => (n - r) / (n + r + 0.16),
    domain: [-1, 1],
    colorRange: [0.15, 0.7]
  },
  'MS_NDWI': {
    id: 'MS_NDWI',
    name: 'NDWI (Normalized Difference Water Index)',
    category: 'Multispectral',
    shaderMath: '(g - n) / (g + n + 0.000001)',
    calculate: (r, g, b, n) => (g - n) / (g + n + 0.000001),
    domain: [-1, 1],
    // NDWI for turf is negative (NIR > Green); ~-0.6 (dense) … -0.1 (sparse/moist).
    // Bracket that so it isn't uniformly red; higher (moister) → green.
    colorRange: [-0.6, -0.1]
  },
  'MS_CLRE': {
    id: 'MS_CLRE',
    // Gitelson et al. (2003) — CLREdge = (NIR / RedEdge) − 1
    // Theoretical range: [-1, ∞). Practical for vegetation: [-1, 8].
    // Negative values occur when NIR < RedEdge (stressed/non-vegetated areas).
    // Healthy dense vegetation typically produces values of 1–5.
    name: 'CI-RedEdge',
    category: 'Multispectral',
    shaderMath: '(n / (e + 0.000001)) - 1.0',
    calculate: (r, g, b, n, e) => (n / (e + 0.000001)) - 1.0,
    domain: [-1, 8],
    colorRange: [0, 5]
  }
};
