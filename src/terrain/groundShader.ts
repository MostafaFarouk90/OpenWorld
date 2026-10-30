// The Act 2 ground material (thread A1): the plain terrain material plus Cinderreach's ember seams and ash-fog in the
// dips, driven by the chunk's `ground` attribute (ground.ts: ember weight, ash-fog weight). Act 1 chunks never get a
// `ground` attribute and keep the plain material, so nothing here touches their shading.
//
// The seam pattern samples a region-local coordinate, `modelMatrix[3].xz - uOrigin + position.xz`: the chunk's centre
// (exact in float32 at these distances) minus the Act 2 ground origin, plus the vertex's chunk-local offset. Raw world
// coordinates 20 km out would quantise the pattern into blocks (A0's Step 0). `uTime` is wrapped on the CPU to a whole
// number of pulse periods, so the pulse never jumps and float32 never sees a large time.
//
// Act 3 (thread K1) reuses the one shader with three materials, one per origin (Act 2, Greyfen, Dragonspine; see
// createGroundMaterial and groundOriginFor in ground.ts). On a Dragonspine material `uGroundVein` is 1: the `ground.x`
// channel then means forge-glass vein weight, drawn as a thin faint emissive streak, and the ember seams are off.
import * as THREE from 'three';
import { GROUND_ORIGINS, type GroundOriginKey } from './ground';

/** Seconds per ember pulse; GROUND_TIME_WRAP is a whole number of them. */
export const EMBER_PULSE_PERIOD = 6;
export const GROUND_TIME_WRAP = 600;
/** Seam cells are this many metres across. */
export const SEAM_CELL = 14;
/** Seams show only in patches of about this size (metres). */
export const SEAM_PATCH = 90;
/** Ash-fog fades out between these view distances (metres): it lies only in dips near the player. */
export const ASH_FADE_NEAR = 700;
export const ASH_FADE_FAR = 1100;

/** Forge-glass veins: thin streaks along a noise's mid line, in rare patches of about VEIN_PATCH metres. */
export const VEIN_CELL = 36;
export const VEIN_PATCH = 220;
export const VEIN_COLOR = new THREE.Color(1.0, 0.5, 0.18);

export const EMBER_COLOR = new THREE.Color(1.0, 0.32, 0.06);
export const ASH_FOG_COLOR = new THREE.Color(0.42, 0.4, 0.38);

export const GROUND_VERTEX_DECL = /* glsl */ `
attribute vec2 ground;
uniform vec2 uGroundOrigin;
varying vec2 vGround;
varying vec2 vGroundLocal;
varying float vGroundViewDist;
`;

export const GROUND_VERTEX_MAIN = /* glsl */ `
vGround = ground;
vGroundLocal = modelMatrix[3].xz - uGroundOrigin + position.xz;
vGroundViewDist = length(mvPosition.xyz);
`;

export const GROUND_FRAGMENT_DECL = /* glsl */ `
uniform float uGroundTime;
uniform vec3 uEmberColor;
uniform vec3 uAshFogColor;
uniform float uGroundVein;
uniform vec3 uVeinColor;
varying vec2 vGround;
varying vec2 vGroundLocal;
varying float vGroundViewDist;
float groundHash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float groundValueNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = groundHash(i);
  float b = groundHash(i + vec2(1.0, 0.0));
  float c = groundHash(i + vec2(0.0, 1.0));
  float d = groundHash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
float groundSeam(vec2 local) {
  // Thin cracks along the noise's mid line, only in scattered patches.
  float n = groundValueNoise(local / ${SEAM_CELL.toFixed(1)});
  float crack = smoothstep(0.94, 0.99, 1.0 - abs(2.0 * n - 1.0));
  float seamPatch = smoothstep(0.5, 0.75, groundValueNoise(local / ${SEAM_PATCH.toFixed(1)} + 17.0));
  return crack * seamPatch;
}
float groundVeinStreak(vec2 local) {
  float n = groundValueNoise(local / ${VEIN_CELL.toFixed(1)} + 5.0);
  float streak = smoothstep(0.975, 0.995, 1.0 - abs(2.0 * n - 1.0));
  float veinPatch = smoothstep(0.62, 0.8, groundValueNoise(local / ${VEIN_PATCH.toFixed(1)} + 31.0));
  return streak * veinPatch;
}
`;

export const GROUND_FRAGMENT_COLOR = /* glsl */ `
float groundAsh = vGround.y * (1.0 - smoothstep(${ASH_FADE_NEAR.toFixed(1)}, ${ASH_FADE_FAR.toFixed(1)}, vGroundViewDist));
diffuseColor.rgb = mix(diffuseColor.rgb, uAshFogColor, groundAsh * 0.45);
`;

export const GROUND_FRAGMENT_EMISSIVE = /* glsl */ `
float groundPulse = 0.65 + 0.35 * sin(uGroundTime * ${((2 * Math.PI) / EMBER_PULSE_PERIOD).toFixed(6)} + groundValueNoise(vGroundLocal / 40.0) * 6.283185);
totalEmissiveRadiance += uEmberColor * (vGround.x * groundSeam(vGroundLocal) * groundPulse * 0.9 * (1.0 - uGroundVein));
totalEmissiveRadiance += uVeinColor * (vGround.x * groundVeinStreak(vGroundLocal) * uGroundVein * (0.2 + 0.1 * groundPulse));
`;

export interface GroundUniforms {
  uGroundOrigin: { value: THREE.Vector2 };
  uGroundTime: { value: number };
  uEmberColor: { value: THREE.Color };
  uAshFogColor: { value: THREE.Color };
  uGroundVein: { value: number };
  uVeinColor: { value: THREE.Color };
}

/** Injects the ground snippets into a MeshStandardMaterial's shader source. Pure (on the strings). */
export function injectGround(vertex: string, fragment: string): { vertex: string; fragment: string } {
  const need = (src: string, token: string): void => {
    if (!src.includes(token)) throw new Error(`groundShader: '${token}' is missing from the shader`);
  };
  need(vertex, '#include <common>');
  need(vertex, '#include <project_vertex>');
  need(fragment, '#include <common>');
  need(fragment, '#include <color_fragment>');
  need(fragment, '#include <emissivemap_fragment>');
  return {
    vertex: vertex
      .replace('#include <common>', `#include <common>\n${GROUND_VERTEX_DECL}`)
      .replace('#include <project_vertex>', `#include <project_vertex>\n${GROUND_VERTEX_MAIN}`),
    fragment: fragment
      .replace('#include <common>', `#include <common>\n${GROUND_FRAGMENT_DECL}`)
      .replace('#include <color_fragment>', `#include <color_fragment>\n${GROUND_FRAGMENT_COLOR}`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>\n${GROUND_FRAGMENT_EMISSIVE}`),
  };
}

/** `seconds` wrapped to a whole number of pulse periods. Pure. */
export function wrapGroundTime(seconds: number): number {
  return Number.isFinite(seconds) ? ((seconds % GROUND_TIME_WRAP) + GROUND_TIME_WRAP) % GROUND_TIME_WRAP : 0;
}

/** The ground material for one origin: a copy of the terrain material's settings with the snippets injected. */
export function createGroundMaterial(params: THREE.MeshStandardMaterialParameters, origin: GroundOriginKey = 'act2'): { material: THREE.MeshStandardMaterial; uniforms: GroundUniforms } {
  const o = GROUND_ORIGINS[origin];
  const uniforms: GroundUniforms = {
    uGroundOrigin: { value: new THREE.Vector2(o.x, o.z) },
    uGroundVein: { value: origin === 'dragonspine' ? 1 : 0 },
    uVeinColor: { value: VEIN_COLOR.clone() },
    uGroundTime: { value: 0 },
    uEmberColor: { value: EMBER_COLOR.clone() },
    uAshFogColor: { value: ASH_FOG_COLOR.clone() },
  };
  const material = new THREE.MeshStandardMaterial(params);
  const key = origin === 'act2' ? 'terrain-act2-ground' : `terrain-${origin}-ground`;
  material.name = key;
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    const out = injectGround(shader.vertexShader, shader.fragmentShader);
    shader.vertexShader = out.vertex;
    shader.fragmentShader = out.fragment;
  };
  material.customProgramCacheKey = () => key;
  return { material, uniforms };
}

// ---- TypeScript mirror of the seam pattern, float32 at every step as the GPU computes it (for tests)

const f = Math.fround;
const fract = (x: number) => f(x - Math.floor(x));

export function seamHash(px: number, py: number): number {
  let x = fract(f(px * f(0.1031)));
  let y = fract(f(py * f(0.1031)));
  let z = fract(f(px * f(0.1031)));
  const d = f(f(f(x * f(y + f(33.33))) + f(y * f(z + f(33.33)))) + f(z * f(x + f(33.33))));
  x = f(x + d);
  y = f(y + d);
  z = f(z + d);
  return fract(f(f(x + y) * z));
}

export function seamValueNoise(px: number, py: number): number {
  const ix = Math.floor(px);
  const iy = Math.floor(py);
  const fx = f(px - ix);
  const fy = f(py - iy);
  const ux = f(fx * fx * (3 - 2 * fx));
  const uy = f(fy * fy * (3 - 2 * fy));
  const a = seamHash(ix, iy);
  const b = seamHash(ix + 1, iy);
  const c = seamHash(ix, iy + 1);
  const d = seamHash(ix + 1, iy + 1);
  const ab = a + (b - a) * ux;
  const cd = c + (d - c) * ux;
  return f(ab + (cd - ab) * uy);
}

/** The seam intensity (0..1) at a region-local point, as the shader computes it. */
const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(Math.max((x - a) / (b - a), 0), 1);
  return t * t * (3 - 2 * t);
};

export function seamAt(localX: number, localZ: number): number {
  const n = seamValueNoise(f(f(localX) / SEAM_CELL), f(f(localZ) / SEAM_CELL));
  const crack = smooth(0.94, 0.99, 1 - Math.abs(2 * n - 1));
  const patch = smooth(0.5, 0.75, seamValueNoise(f(f(f(localX) / SEAM_PATCH) + 17), f(f(f(localZ) / SEAM_PATCH) + 17)));
  return crack * patch;
}

/** The vein streak intensity (0..1) at a region-local point, as the shader computes it. */
export function veinAt(localX: number, localZ: number): number {
  const n = seamValueNoise(f(f(f(localX) / VEIN_CELL) + 5), f(f(f(localZ) / VEIN_CELL) + 5));
  const streak = smooth(0.975, 0.995, 1 - Math.abs(2 * n - 1));
  const veinPatch = smooth(0.62, 0.8, seamValueNoise(f(f(f(localX) / VEIN_PATCH) + 31), f(f(f(localZ) / VEIN_PATCH) + 31)));
  return streak * veinPatch;
}

/** The shader's region-local coordinate for a vertex, in float32: chunk centre minus origin plus the local offset. */
export function shaderLocal(chunkCentre: number, origin: number, vertexOffset: number): number {
  return f(f(f(chunkCentre) - f(origin)) + f(vertexOffset));
}
