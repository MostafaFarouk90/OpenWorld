// N3 lava shader (plans/act5-N3.md 1.4): an emissive scroll with a dark crust band and hot cracks, plus a slow vertex
// swell. Noise is sampled from the mesh's own (small) vertex coordinates plus a region-local offset uniform, never from
// world positions on the GPU, so the Caldera at 11 km from the origin shades cleanly (src/rendering/farPrecision.ts).
// Colours above 1 let the Medium and High bloom do the glow: lava needs no pool light.
import * as THREE from 'three';

export const NOISE_GLSL = /* glsl */ `
  float lavaH2(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float lavaN2(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(lavaH2(i), lavaH2(i + vec2(1.0, 0.0)), u.x), mix(lavaH2(i + vec2(0.0, 1.0)), lavaH2(i + vec2(1.0, 1.0)), u.x), u.y); }`;

export interface LavaUniforms {
  [k: string]: THREE.IUniform;
  uTime: THREE.IUniform<number>;
  /** The mesh origin minus the region's centre (x, z), metres: small numbers. */
  uOffset: THREE.IUniform<THREE.Vector2>;
  /** 0 molten, 1 a fully cooled crust (vents). */
  uCool: THREE.IUniform<number>;
  /** 0 none, 1 cracks glowing on a crust about to melt (and on the breaking floor). */
  uCrack: THREE.IUniform<number>;
  /** Vertex swell amplitude (m); 0 on crusts and floors. */
  uSwell: THREE.IUniform<number>;
}

const VERT = /* glsl */ `
  uniform float uTime; uniform vec2 uOffset; uniform float uSwell;
  varying vec2 vL;
  #include <fog_pars_vertex>
  ${NOISE_GLSL}
  void main(){
    vec3 p = position;
    vL = p.xz + uOffset;
    p.y += uSwell * (lavaN2(vL * 0.08 + uTime * 0.15) - 0.5);
    vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }`;

const FRAG = /* glsl */ `
  uniform float uTime; uniform float uCool; uniform float uCrack;
  varying vec2 vL;
  #include <fog_pars_fragment>
  ${NOISE_GLSL}
  void main(){
    float a = lavaN2(vL * 0.05 + vec2(uTime * 0.05, uTime * 0.03));
    float b = lavaN2(vL * 0.21 - vec2(uTime * 0.11, 0.0));
    float crust = smoothstep(0.45, 0.75, a * 0.65 + b * 0.35);
    vec3 hot = mix(vec3(1.0, 0.35, 0.05), vec3(1.0, 0.85, 0.3), b);
    vec3 col = mix(hot * 2.2, vec3(0.08, 0.05, 0.04), crust);
    // a cooled crust: dark rock with faint seams; cracks glow when it is about to melt
    vec3 rock = vec3(0.07, 0.05, 0.045) + vec3(0.25, 0.06, 0.0) * smoothstep(0.8, 0.95, b) * 0.4;
    float seam = smoothstep(0.86, 0.97, lavaN2(vL * 0.6));
    rock += hot * 1.8 * seam * uCrack;
    col = mix(col, rock, clamp(uCool, 0.0, 1.0));
    gl_FragColor = vec4(col, 1.0);
    #include <fog_fragment>
  }`;

export function makeLavaUniforms(offset: { x: number; z: number }, opts: { swell?: number; cool?: number } = {}): LavaUniforms {
  return {
    uTime: { value: 0 },
    uOffset: { value: new THREE.Vector2(offset.x, offset.z) },
    uCool: { value: opts.cool ?? 0 },
    uCrack: { value: 0 },
    uSwell: { value: opts.swell ?? 0.35 },
  };
}

export function lavaMaterial(uniforms: LavaUniforms): THREE.ShaderMaterial {
  // The scene's fog applies: with `fog: true` three refreshes these fog uniforms from scene.fog every frame.
  Object.assign(uniforms, THREE.UniformsUtils.clone(THREE.UniformsLib.fog));
  const m = new THREE.ShaderMaterial({ uniforms, vertexShader: VERT, fragmentShader: FRAG, fog: true });
  m.name = 'caldera-lava';
  return m;
}
