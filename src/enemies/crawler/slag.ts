import * as THREE from 'three';

/**
 * The slag shader: glowing seams on dark basalt, injected into a MeshStandardMaterial. FAR-COORDINATE RULE:
 * the pattern samples only the vertex `position` attribute (object space), never a world position, so it stays
 * stable and precise 22 km from the origin. Nothing here may use modelMatrix, worldPosition or cameraPosition.
 */
export const SLAG_GLSL = {
  vertexDecl: 'varying vec3 vSlagPos;',
  vertexMain: 'vSlagPos = position;',
  fragmentDecl: /* glsl */ `
varying vec3 vSlagPos;
uniform float uGlow;
uniform float uTele;
uniform float uSeed;
uniform float uSeamK;
uniform vec3 uSeam;
uniform vec3 uTeleColor;
float slagSeam(vec3 q) {
  vec3 p = q * 4.0 + vec3(uSeed, uSeed * 0.7, uSeed * 1.3);
  float a = abs(sin(p.x * 2.1 + sin(p.y * 1.7 + p.z * 2.3) * 1.5));
  float b = abs(sin(p.z * 1.9 + sin(p.x * 2.7 - p.y * 1.3) * 1.4));
  return 1.0 - smoothstep(0.0, 0.16, min(a, b));
}`,
  fragmentMain: /* glsl */ `
{
  float seam = slagSeam(vSlagPos);
  vec3 seamCol = mix(uSeam, uTeleColor, uTele);
  totalEmissiveRadiance += seamCol * seam * uGlow * uSeamK * (1.0 + uTele * 1.5);
}`,
} as const;

export interface SlagUniforms {
  uGlow: { value: number };
  uTele: { value: number };
  uSeed: { value: number };
  uSeamK: { value: number };
  uSeam: { value: THREE.Color };
  uTeleColor: { value: THREE.Color };
}

/** Patches a compiling shader (the `onBeforeCompile` argument). Exported so tests can inspect the result. */
export function applySlagShader(
  shader: { vertexShader: string; fragmentShader: string; uniforms: Record<string, { value: unknown }> },
  u: SlagUniforms,
): void {
  Object.assign(shader.uniforms, u);
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', `#include <common>\n${SLAG_GLSL.vertexDecl}`)
    .replace('#include <begin_vertex>', `#include <begin_vertex>\n${SLAG_GLSL.vertexMain}`);
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', `#include <common>\n${SLAG_GLSL.fragmentDecl}`)
    .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>\n${SLAG_GLSL.fragmentMain}`);
}

export function slagUniforms(m: THREE.Material): SlagUniforms {
  return m.userData['slag'] as SlagUniforms;
}

/** The seam colour for an emissive recipe: the emissive hue at full brightness (orange when black). */
export function seamColor(emissive: number): THREE.Color {
  const c = new THREE.Color(emissive);
  const m = Math.max(c.r, c.g, c.b);
  return m > 1e-3 ? c.multiplyScalar(1 / m) : c.set(0xff5a10);
}

export function makeSlagMaterial(
  name: string,
  tint: THREE.Color,
  emissive: THREE.Color,
  seam: THREE.Color,
  seamK: number,
  seed: number,
): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({ name, color: tint, emissive, roughness: 0.92, metalness: 0.05 });
  const u: SlagUniforms = {
    uGlow: { value: 1 },
    uTele: { value: 0 },
    uSeed: { value: seed },
    uSeamK: { value: seamK },
    uSeam: { value: seam.clone() },
    uTeleColor: { value: new THREE.Color(0xffffff) },
  };
  mat.userData['slag'] = u;
  mat.onBeforeCompile = (shader) => applySlagShader(shader as never, u);
  mat.customProgramCacheKey = () => 'slag-crawler';
  return mat;
}
