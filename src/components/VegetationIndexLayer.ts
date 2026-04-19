import { BitmapLayer } from '@deck.gl/layers';
import type { BitmapLayerProps } from '@deck.gl/layers';

export interface VegetationIndexLayerProps extends BitmapLayerProps {
  shaderMath: string;
  range: [number, number];
  /** Maps logical channels to physical RGBA bytes.
   *  r/g/b: 0–2 = R/G/B channels; nir: 3 = Alpha channel.
   *  re (Red-Edge): 0–3 selects from a second packed pixel where RE was stored.
   *  For standard 4-band COGs packed as [R, G, B, NIR_as_Alpha], nir=3 and re=3
   *  is a reasonable fallback (NDRE will be approximate). */
  bandMapping?: { r: number; g: number; b: number; nir: number; re: number };
}

const defaultProps = {
  shaderMath: '(g - r) / (g + r - b + 0.000001)', // Default to VARI
  range: [-1, 1],
  bandMapping: { r: 0, g: 1, b: 2, nir: 3, re: 3 }, // re falls back to NIR by default
};

/**
 * A custom BitmapLayer that applies a vegetation index formula
 * directly on the GPU using a GLSL fragment shader.
 *
 * Channels packed in the RGBA texture:
 *   R → logical red
 *   G → logical green
 *   B → logical blue
 *   A → NIR (near-infrared)
 *
 * Red-Edge is mapped from the same texture via u_band_re. For 5-band sensors
 * where RE was stored separately, the bandMapping.re value can be updated to
 * point to the correct virtual channel once a second texture path is wired in.
 * For now RE falls back to NIR (channel 3) which gives approximate NDRE.
 */
// Custom Luma.GL shader module to safely bind uniforms in deck.gl v9
const vegetationUniformsModule = {
  name: 'vegetation_uniforms',
  fs: `
    uniform float u_range_min;
    uniform float u_range_max;
    uniform float u_band_r;
    uniform float u_band_g;
    uniform float u_band_b;
    uniform float u_band_nir;
    uniform float u_band_re;
  `,
  // Maps Deck.GL Layer props into WebGL uniforms matching the definitions above
  getUniforms: (props: any) => {
    if (!props) return {};
    return {
      u_range_min: props.range?.[0] ?? -1,
      u_range_max: props.range?.[1] ?? 1,
      u_band_r: props.bandMapping?.r ?? 0,
      u_band_g: props.bandMapping?.g ?? 1,
      u_band_b: props.bandMapping?.b ?? 2,
      u_band_nir: props.bandMapping?.nir ?? 3,
      u_band_re: props.bandMapping?.re ?? 3,
    };
  }
};

export class VegetationIndexLayer extends BitmapLayer<VegetationIndexLayerProps> {
  static layerName = 'VegetationIndexLayer';
  static defaultProps = defaultProps;

  getShaders() {
    const shaders = super.getShaders();
    const { shaderMath } = this.props;
    
    // Mix in our custom uniform module for luma.gl v9 compatibility
    shaders.modules = [...(shaders.modules || []), vegetationUniformsModule];

    shaders.inject = {
      'fs:#decl': `
        // Returns the 0–1 value for the given channel index (0=R, 1=G, 2=B, 3=A)
        float getBand(vec4 color, float index) {
            if (index < 0.5) return color.r;
            if (index < 1.5) return color.g;
            if (index < 2.5) return color.b;
            return color.a; // NIR stored in alpha
        }
      `,
      'fs:DECKGL_FILTER_COLOR': `
        // Extract logical channels based on configurable band mapping
        float r = getBand(color, u_band_r);
        float g = getBand(color, u_band_g);
        float b = getBand(color, u_band_b);
        float n = getBand(color, u_band_nir);
        float e = getBand(color, u_band_re); // Red-Edge (falls back to NIR if unmapped)

        // Apply the selected vegetation index formula
        float val = ${shaderMath};

        // Normalize to the user-defined range slider
        float normalized = (val - u_range_min) / (u_range_max - u_range_min);
        normalized = clamp(normalized, 0.0, 1.0);

        // Color ramp: Red (0.0) → Yellow (0.5) → Green (1.0)
        vec3 rgb;
        if (normalized < 0.5) {
            rgb = mix(vec3(0.93, 0.26, 0.26), vec3(0.91, 0.70, 0.03), normalized * 2.0);
        } else {
            rgb = mix(vec3(0.91, 0.70, 0.03), vec3(0.13, 0.77, 0.36), (normalized - 0.5) * 2.0);
        }

        // Preserve transparency for empty/nodata pixels (since alpha channel holds NIR, sum all bands instead)
        float total_refl = r + g + b + n + e;
        color = vec4(rgb, total_refl > 0.01 ? 1.0 : 0.0);
      `
    };

    return shaders;
  }

}
