import { BitmapLayer } from '@deck.gl/layers';
import type { BitmapLayerProps } from '@deck.gl/layers';

export interface VegetationIndexLayerProps extends BitmapLayerProps {
  shaderMath: string;
  range: [number, number];
  bandMapping?: { r: number; g: number; b: number; nir: number; re: number };
}

const defaultBandMapping = { r: 0, g: 1, b: 2, nir: 3, re: 3 };

const defaultProps = {
  shaderMath: '(g - r) / (g + r - b + 0.000001)',
  range: [-1, 1] as [number, number],
  bandMapping: defaultBandMapping,
};

/**
 * A custom BitmapLayer that applies a chosen vegetation index formula
 * on the GPU via a GLSL fragment shader.
 *
 * ─── Strategy ────────────────────────────────────────────────────────────────
 * Deck.GL v9 / Luma.GL v9 removed the old `model.setUniforms()` API and the
 * old ShaderModule `getUniforms` callback pattern no longer auto-fires.
 * Rather than fighting with the new UBO system, we take the simplest reliable
 * approach: bake ALL values (range, band mapping, formula) directly into the
 * GLSL source string at compile time. When any prop changes, the layer key
 * changes and Deck.GL rebuilds the shader automatically.
 *
 * ─── RGBA Texture Layout ─────────────────────────────────────────────────────
 *   R → Band 0 (Red)
 *   G → Band 1 (Green)
 *   B → Band 2 (Blue  | NIR for 5-band sensors)
 *   A → Band 3 (Alpha | NIR for 4-band RGB+alpha | RedEdge for 5-band)
 */
export class VegetationIndexLayer extends BitmapLayer<VegetationIndexLayerProps> {
  static layerName = 'VegetationIndexLayer';
  static defaultProps = defaultProps;

  getShaders() {
    const shaders = super.getShaders();

    const {
      shaderMath = defaultProps.shaderMath,
      range = defaultProps.range,
      bandMapping = defaultBandMapping,
    } = this.props;

    // Bake all values into the GLSL source so no uniform binding is needed.
    const rangeMin = range[0].toFixed(8);
    const rangeMax = range[1].toFixed(8);
    const bR   = bandMapping.r.toFixed(1);
    const bG   = bandMapping.g.toFixed(1);
    const bB   = bandMapping.b.toFixed(1);
    const bNir = bandMapping.nir.toFixed(1);
    const bRe  = bandMapping.re.toFixed(1);

    shaders.inject = {
      // Declare helper function in fragment shader
      'fs:#decl': `
        // Returns the 0-1 float value for texture channel index 0=R,1=G,2=B,3=A
        float getBand(vec4 col, float idx) {
          if (idx < 0.5) return col.r;
          if (idx < 1.5) return col.g;
          if (idx < 2.5) return col.b;
          return col.a;
        }
      `,

      // Main vegetation index filter — all constants baked in at compile time
      'fs:DECKGL_FILTER_COLOR': `
        // Extract spectral channels (all constants, no uniforms needed)
        float r = getBand(color, ${bR});
        float g = getBand(color, ${bG});
        float b = getBand(color, ${bB});
        float n = getBand(color, ${bNir});
        float e = getBand(color, ${bRe});

        // Vegetation index formula (baked in)
        float val = ${shaderMath};

        // Map to [0,1] over the user's range (also baked in)
        const float RANGE_MIN = ${rangeMin};
        const float RANGE_MAX = ${rangeMax};
        float denom = RANGE_MAX - RANGE_MIN;
        float normalized = (denom > 0.0) ? clamp((val - RANGE_MIN) / denom, 0.0, 1.0) : 0.5;

        // Color ramp: Red → Yellow → Green
        vec3 outRgb;
        if (normalized < 0.5) {
          outRgb = mix(vec3(0.93, 0.26, 0.26), vec3(0.91, 0.70, 0.03), normalized * 2.0);
        } else {
          outRgb = mix(vec3(0.91, 0.70, 0.03), vec3(0.13, 0.77, 0.36), (normalized - 0.5) * 2.0);
        }

        // Nodata = all bands zero. Use very small threshold to handle Float32 reflectance.
        float total = r + g + b + n + e;
        color = vec4(outRgb, total > 0.0001 ? 1.0 : 0.0);
      `
    };

    return shaders;
  }
}
