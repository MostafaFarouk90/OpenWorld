import * as THREE from 'three';
import type { WyrmPalette } from './palettes';

/**
 * The wyrm's material roles and their shader patches. Every patch reads object-space values only (the geometry's own
 * position and normal, or the instance index), never world position, so the far-coordinate rule holds (v0.6; A0's
 * report). Palette colours and per-wyrm values (mouth glow, wing flash) are uniforms held in closures, never in
 * `userData`: `Material.clone()` deep-copies `userData` through JSON and drops `onBeforeCompile`, and the VFX service
 * clones actor materials on the first telegraph (`ActorMaterials.install` chains this patch from the original).
 * One program per role whatever the palette: `customProgramCacheKey` names the role only.
 */

/** Part ids in the scale role's `aPart` attribute. */
export const PART = { scale: 0, horn: 1, eye: 2, mouth: 3, frame: 4, metal: 5 } as const;

/** What a patch is handed by three's `onBeforeCompile` (the subset used here). */
export interface ShaderLike {
  uniforms: Record<string, { value: unknown }>;
  vertexShader: string;
  fragmentShader: string;
}

/** Per-wyrm uniforms shared by every material of one rig (and by the VFX clones of those materials). */
export interface WyrmUniforms {
  uScale: { value: THREE.Color };
  uBelly: { value: THREE.Color };
  uRim: { value: THREE.Color };
  uRimStrength: { value: number };
  uCrack: { value: THREE.Color };
  uHorn: { value: THREE.Color };
  uEye: { value: THREE.Color };
  uMouthColor: { value: THREE.Color };
  uFrame: { value: THREE.Color };
  uMembrane: { value: THREE.Color };
  /** Mouth glow, 0..1 (the inhale ramp). */
  uMouth: { value: number };
  /** White flash on the wings, 0..1 (the dive's wing fold). */
  uFlash: { value: number };
  /** Ember glow on the tail, 0..1 (the tail whip's wind-up). */
  uTailGlow: { value: number };
  /** Seconds, wrapped; drives the slow crack pulse. */
  uWyrmTime: { value: number };
  /** Spine segments, for the per-instance tail fraction. */
  uSegments: { value: number };
  /** Membrane billow amplitude in metres (0 past the near LOD). */
  uBillow: { value: number };
  /** Wing fold, 0 open .. 1 folded. */
  uFold: { value: number };
  /** Billow wave phase, radians. */
  uPhase: { value: number };
  /** Wing frames: wing-local to rig-local (left, right). */
  uWingL: { value: THREE.Matrix4 };
  uWingR: { value: THREE.Matrix4 };
}

export function makeUniforms(p: WyrmPalette, segments: number): WyrmUniforms {
  return {
    uScale: { value: new THREE.Color(p.scale) },
    uBelly: { value: new THREE.Color(p.belly) },
    uRim: { value: new THREE.Color(p.rim) },
    uRimStrength: { value: p.rimStrength },
    uCrack: { value: new THREE.Color(p.crack) },
    uHorn: { value: new THREE.Color(p.horn) },
    uEye: { value: new THREE.Color(p.eye) },
    uMouthColor: { value: new THREE.Color(p.mouth) },
    uFrame: { value: new THREE.Color(p.frame) },
    uMembrane: { value: new THREE.Color(p.membrane) },
    uMouth: { value: 0 },
    uFlash: { value: 0 },
    uTailGlow: { value: 0 },
    uWyrmTime: { value: 0 },
    uSegments: { value: segments },
    uBillow: { value: 0 },
    uFold: { value: 0 },
    uPhase: { value: 0 },
    uWingL: { value: new THREE.Matrix4() },
    uWingR: { value: new THREE.Matrix4() },
  };
}

/** Cache keys: one program per role, whatever the palette. */
export const WYRM_CACHE_KEYS = { scales: 'wyrm-scales-v1', membrane: 'wyrm-membrane-v1', membraneDepth: 'wyrm-membrane-depth-v1' } as const;

function bind(shader: ShaderLike, u: WyrmUniforms, names: readonly (keyof WyrmUniforms)[]): void {
  for (const n of names) shader.uniforms[n] = u[n];
}

const SCALE_UNIFORMS = [
  'uScale', 'uBelly', 'uRim', 'uRimStrength', 'uCrack', 'uHorn', 'uEye', 'uMouthColor', 'uFrame', 'uMouth', 'uFlash', 'uTailGlow', 'uWyrmTime', 'uSegments',
] as const;

/** The scale role: base and belly colour by part, ember fresnel rim, glowing cracks from object-space position, eyes and mouth core. */
export function patchScales(shader: ShaderLike, u: WyrmUniforms): void {
  bind(shader, u, SCALE_UNIFORMS);
  shader.vertexShader = shader.vertexShader
    .replace(
      '#include <common>',
      `#include <common>
attribute float aPart;
attribute float aSeg;
varying float vPart;
varying float vSeg;
varying vec3 vObjPos;
varying vec3 vObjNormal;`,
    )
    .replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
vPart = aPart;
vSeg = aSeg;
vObjPos = position;
vObjNormal = normal;`,
    );
  shader.fragmentShader = shader.fragmentShader
    .replace(
      '#include <common>',
      `#include <common>
uniform vec3 uScale;
uniform vec3 uBelly;
uniform vec3 uRim;
uniform float uRimStrength;
uniform vec3 uCrack;
uniform vec3 uHorn;
uniform vec3 uEye;
uniform vec3 uMouthColor;
uniform vec3 uFrame;
uniform float uMouth;
uniform float uFlash;
uniform float uTailGlow;
uniform float uWyrmTime;
uniform float uSegments;
varying float vPart;
varying float vSeg;
varying vec3 vObjPos;
varying vec3 vObjNormal;
float wyrmIs(float id) { return 1.0 - step(0.5, abs(vPart - id)); }`,
    )
    .replace(
      '#include <color_fragment>',
      `#include <color_fragment>
float wyrmBelly = smoothstep(0.1, -0.7, normalize(vObjNormal).y);
vec3 wyrmBase = mix(uScale, uBelly, wyrmBelly) * wyrmIs(0.0) + uHorn * wyrmIs(1.0) + uEye * 0.2 * wyrmIs(2.0)
  + uMouthColor * 0.15 * wyrmIs(3.0) + uFrame * wyrmIs(4.0) + vec3(0.32, 0.31, 0.3) * wyrmIs(5.0);
diffuseColor.rgb *= wyrmBase;`,
    )
    .replace(
      '#include <emissivemap_fragment>',
      `#include <emissivemap_fragment>
float wyrmFres = pow(1.0 - clamp(abs(dot(normal, normalize(vViewPosition))), 0.0, 1.0), 3.0);
float wyrmCell = abs(sin(vObjPos.x * 9.0 + 1.3) * sin(vObjPos.y * 7.0 + vObjPos.z * 5.0));
float wyrmCrack = smoothstep(0.08, 0.0, wyrmCell) * (0.6 + 0.4 * sin(uWyrmTime * 1.7 + vSeg * 0.6));
float wyrmTail = smoothstep(0.55, 0.9, vSeg / max(1.0, uSegments - 1.0));
totalEmissiveRadiance += (uRim * wyrmFres * uRimStrength + uCrack * wyrmCrack * 0.35 + uRim * wyrmTail * uTailGlow * 1.6) * wyrmIs(0.0)
  + uEye * 1.6 * wyrmIs(2.0)
  + uMouthColor * (0.25 + 2.6 * uMouth) * wyrmIs(3.0)
  + vec3(1.0) * uFlash * 0.9 * wyrmIs(4.0);`,
    );
}

const MEMBRANE_UNIFORMS = ['uMembrane', 'uRim', 'uFlash', 'uBillow', 'uFold', 'uPhase', 'uWingL', 'uWingR'] as const;

/** The membrane vertex patch: fold, billow and the per-side wing frame (shared by the colour and the depth material). */
const MEMBRANE_VERTEX = `
vec3 wyrmP = position;
float wyrmU = aWing.x;
float wyrmV = aWing.y;
wyrmP.x *= 1.0 - 0.6 * uFold;
wyrmP.z *= 1.0 - 0.3 * uFold;
wyrmP.y += sin(3.14159 * wyrmV) * sin(3.14159 * wyrmU) * uBillow * (0.6 + 0.4 * sin(uPhase - wyrmU * 2.5));
mat4 wyrmWv = aSide < 0.0 ? uWingL : uWingR;
vec3 transformed = (wyrmWv * vec4(wyrmP, 1.0)).xyz;`;

export function patchMembrane(shader: ShaderLike, u: WyrmUniforms): void {
  bind(shader, u, MEMBRANE_UNIFORMS);
  shader.vertexShader = shader.vertexShader
    .replace(
      '#include <common>',
      `#include <common>
attribute float aSide;
attribute vec2 aWing;
uniform float uBillow;
uniform float uFold;
uniform float uPhase;
uniform mat4 uWingL;
uniform mat4 uWingR;`,
    )
    .replace(
      '#include <beginnormal_vertex>',
      `#include <beginnormal_vertex>
objectNormal = normalize(mat3(aSide < 0.0 ? uWingL : uWingR) * objectNormal);`,
    )
    .replace('#include <begin_vertex>', MEMBRANE_VERTEX);
  shader.fragmentShader = shader.fragmentShader
    .replace(
      '#include <common>',
      `#include <common>
uniform vec3 uMembrane;
uniform vec3 uRim;
uniform float uFlash;`,
    )
    .replace(
      '#include <color_fragment>',
      `#include <color_fragment>
diffuseColor.rgb *= uMembrane;`,
    )
    .replace(
      '#include <emissivemap_fragment>',
      `#include <emissivemap_fragment>
totalEmissiveRadiance += uRim * 0.08 + vec3(1.0) * uFlash * 0.8;`,
    );
}

/** The membrane's shadow: the same fold, billow and frame on a depth material. */
export function patchMembraneDepth(shader: ShaderLike, u: WyrmUniforms): void {
  bind(shader, u, ['uBillow', 'uFold', 'uPhase', 'uWingL', 'uWingR']);
  shader.vertexShader = shader.vertexShader
    .replace(
      '#include <common>',
      `#include <common>
attribute float aSide;
attribute vec2 aWing;
uniform float uBillow;
uniform float uFold;
uniform float uPhase;
uniform mat4 uWingL;
uniform mat4 uWingR;`,
    )
    .replace('#include <begin_vertex>', MEMBRANE_VERTEX);
}

export interface WyrmMaterials {
  readonly scales: THREE.MeshStandardMaterial;
  readonly membrane: THREE.MeshStandardMaterial;
  readonly membraneDepth: THREE.MeshDepthMaterial;
  readonly breath: THREE.ShaderMaterial;
  readonly decal: THREE.MeshBasicMaterial;
  readonly all: THREE.Material[];
}

export function makeMaterials(u: WyrmUniforms): WyrmMaterials {
  const scales = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.62, metalness: 0.08 });
  scales.name = 'wyrm-scales';
  scales.onBeforeCompile = (s) => patchScales(s as unknown as ShaderLike, u);
  scales.customProgramCacheKey = () => WYRM_CACHE_KEYS.scales;

  const membrane = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8, metalness: 0, side: THREE.DoubleSide });
  membrane.name = 'wyrm-membrane';
  membrane.onBeforeCompile = (s) => patchMembrane(s as unknown as ShaderLike, u);
  membrane.customProgramCacheKey = () => WYRM_CACHE_KEYS.membrane;

  const membraneDepth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, side: THREE.DoubleSide });
  membraneDepth.onBeforeCompile = (s) => patchMembraneDepth(s as unknown as ShaderLike, u);
  membraneDepth.customProgramCacheKey = () => WYRM_CACHE_KEYS.membraneDepth;

  const breath = new THREE.ShaderMaterial({
    uniforms: { uPointScale: { value: 1 } },
    vertexShader: `
attribute float aSize;
attribute vec4 aColor;
uniform float uPointScale;
varying vec4 vColor;
void main() {
  vColor = aColor;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = aSize * uPointScale * 300.0 / max(0.5, -mv.z);
  gl_Position = projectionMatrix * mv;
}`,
    fragmentShader: `
varying vec4 vColor;
void main() {
  vec2 d = gl_PointCoord - 0.5;
  float a = smoothstep(0.5, 0.0, length(d)) * vColor.a;
  if (a < 0.01) discard;
  gl_FragColor = vec4(vColor.rgb * a, a);
}`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  breath.name = 'wyrm-breath';

  const decal = new THREE.MeshBasicMaterial({
    color: 0xff5a1a,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
  decal.name = 'wyrm-decal';
  return { scales, membrane, membraneDepth, breath, decal, all: [scales, membrane, membraneDepth, breath, decal] };
}
