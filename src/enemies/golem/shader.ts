import * as THREE from 'three';

/** Live uniforms of the crack shader; mutate `.value` to change the glow without recompiling. */
export interface CrackUniforms {
  uGlow: { value: number };
  uCrackColor: { value: THREE.Color };
  uCrackScale: { value: number };
}

/** The part of a three.js shader object the patch touches. */
export interface PatchableShader {
  uniforms: Record<string, { value: unknown }>;
  vertexShader: string;
  fragmentShader: string;
}

/**
 * Crack pattern sampling: BODY-LOCAL coordinates only. The vertex shader takes `transformed` (the vertex in the
 * mesh's own space) times the instance matrix (still the InstancedMesh's object space); it never touches
 * modelMatrix or a world position, so the pattern cannot jitter 22 km from the world origin.
 */
const VERTEX_DECL = 'varying vec3 vCrackPos;';
const VERTEX_BODY = `
vec4 crackP = vec4( transformed, 1.0 );
#ifdef USE_INSTANCING
crackP = instanceMatrix * crackP;
#endif
vCrackPos = crackP.xyz;`;

const FRAGMENT_DECL = `
varying vec3 vCrackPos;
uniform float uGlow;
uniform vec3 uCrackColor;
uniform float uCrackScale;
float crackHash( vec3 p ) { return fract( sin( dot( p, vec3( 127.1, 311.7, 74.7 ) ) ) * 43758.5453 ); }
float crackNoise( vec3 p ) {
  vec3 i = floor( p ); vec3 f = fract( p ); f = f * f * ( 3.0 - 2.0 * f );
  float a = mix( mix( crackHash( i ), crackHash( i + vec3( 1.0, 0.0, 0.0 ) ), f.x ),
                 mix( crackHash( i + vec3( 0.0, 1.0, 0.0 ) ), crackHash( i + vec3( 1.0, 1.0, 0.0 ) ), f.x ), f.y );
  float b = mix( mix( crackHash( i + vec3( 0.0, 0.0, 1.0 ) ), crackHash( i + vec3( 1.0, 0.0, 1.0 ) ), f.x ),
                 mix( crackHash( i + vec3( 0.0, 1.0, 1.0 ) ), crackHash( i + vec3( 1.0, 1.0, 1.0 ) ), f.x ), f.y );
  return mix( a, b, f.z );
}`;
const FRAGMENT_BODY = `
float crackA = crackNoise( vCrackPos * uCrackScale );
float crackRidge = 1.0 - smoothstep( 0.0, 0.06, abs( crackA - 0.5 ) );
float crackB = crackNoise( vCrackPos * uCrackScale * 2.3 + 17.0 );
crackRidge = max( crackRidge, ( 1.0 - smoothstep( 0.0, 0.04, abs( crackB - 0.5 ) ) ) * 0.6 );
totalEmissiveRadiance += uCrackColor * crackRidge * uGlow;`;

/** Injects the emissive crack pattern into a MeshStandardMaterial's shader (an `onBeforeCompile` body). */
export function patchCrackShader(shader: PatchableShader, uniforms: CrackUniforms): void {
  shader.uniforms['uGlow'] = uniforms.uGlow;
  shader.uniforms['uCrackColor'] = uniforms.uCrackColor;
  shader.uniforms['uCrackScale'] = uniforms.uCrackScale;
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', `#include <common>\n${VERTEX_DECL}`)
    .replace('#include <begin_vertex>', `#include <begin_vertex>${VERTEX_BODY}`);
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', `#include <common>${FRAGMENT_DECL}`)
    .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>${FRAGMENT_BODY}`);
}

export interface CrackMaterialOptions {
  tint: number;
  crackColor: number;
  glow?: number;
  scale?: number;
}

/** A rough stone material with glowing cracks. The uniforms are owned by the caller (shared with the compiled program). */
export function createCrackMaterial(o: CrackMaterialOptions): { material: THREE.MeshStandardMaterial; uniforms: CrackUniforms } {
  const uniforms: CrackUniforms = {
    uGlow: { value: o.glow ?? 1.2 },
    uCrackColor: { value: new THREE.Color(o.crackColor) },
    uCrackScale: { value: o.scale ?? 2.6 },
  };
  const material = new THREE.MeshStandardMaterial({ color: o.tint, roughness: 0.95, metalness: 0 });
  material.name = 'golem-stone';
  material.onBeforeCompile = (s) => patchCrackShader(s as unknown as PatchableShader, uniforms);
  material.customProgramCacheKey = () => 'golem-crack-v1';
  return { material, uniforms };
}
