import * as THREE from 'three';
import { HurtboxSet } from '../../combat/HurtboxSet';
import type { HurtboxDef } from '../../combat/types';
import { LOOK } from './tuning';

/** Live uniforms of the lava shader, kept on `material.userData.slagmawUniforms` (tests and debug read them; no recompile needed). */
export interface SlagmawUniforms {
  uTime: { value: number };
  /** 0..1 how much lava shows through the crust (cooled dims it). */
  uGlow: { value: number };
  /** 0..1 added glow for the tremor build-up and spit wind-up. */
  uTelegraph: { value: number };
  uLava: { value: THREE.Color };
  uLavaHot: { value: THREE.Color };
  uScale: { value: number };
}

export interface SlagmawModel {
  /** Origin = the surface spot on the floor; yaw 0 faces -Z. */
  readonly root: THREE.Group;
  /** The hurtbox owner. */
  readonly owner: THREE.Object3D;
  /** Head plus the first three segments. */
  readonly hurtboxes: HurtboxSet;
  /** 0 = fully under the floor, 1 = fully up. Moves the segments along an arc; below 0.05 the root is hidden. */
  setEmergence(e: number): void;
  /** Swaps the crust and lava colours to LOOK.cooledColor and dims the lava. */
  setCooled(cooled: boolean): void;
  /** 0..1 lava glow (tremor build-up, spit wind-up). */
  setTelegraph(t: number): void;
  setOpacity(o: number): void;
  faceToward(x: number, z: number): void;
  /** Scrolls the lava shader time uniform and sways the body. */
  update(dt: number): void;
  /** Head position in world space (the spit origin). */
  headWorld(out: THREE.Vector3): THREE.Vector3;
  dispose(): void;
}

/** Below this emergence the whole worm is hidden (it is under the floor). */
export const HIDE_BELOW = 0.05;

/** The head and the first three body segments carry hurtboxes (bones are plain Object3Ds named like this). */
export const HEAD_BONE = 'slagmaw-head';
export const segmentBone = (i: number): string => `slagmaw-seg-${i}`;

/**
 * The lava pattern samples the mesh's OBJECT-SPACE position (`transformed`) and never the world position or modelMatrix:
 * Deepdelve sits far from the origin and float32 world coordinates would jitter the noise (plans/act2-a0-far-coords.md).
 */
const VERTEX_DECL = 'varying vec3 vLavaPos;';
const VERTEX_BODY = '\nvLavaPos = transformed;';
const FRAGMENT_DECL = `
varying vec3 vLavaPos;
uniform float uTime;
uniform float uGlow;
uniform float uTelegraph;
uniform vec3 uLava;
uniform vec3 uLavaHot;
uniform float uScale;
float lavaHash( vec3 p ) { return fract( sin( dot( p, vec3( 127.1, 311.7, 74.7 ) ) ) * 43758.5453 ); }
float lavaNoise( vec3 p ) {
  vec3 i = floor( p ); vec3 f = fract( p ); f = f * f * ( 3.0 - 2.0 * f );
  float a = mix( mix( lavaHash( i ), lavaHash( i + vec3( 1.0, 0.0, 0.0 ) ), f.x ),
                 mix( lavaHash( i + vec3( 0.0, 1.0, 0.0 ) ), lavaHash( i + vec3( 1.0, 1.0, 0.0 ) ), f.x ), f.y );
  float b = mix( mix( lavaHash( i + vec3( 0.0, 0.0, 1.0 ) ), lavaHash( i + vec3( 1.0, 0.0, 1.0 ) ), f.x ),
                 mix( lavaHash( i + vec3( 0.0, 1.0, 1.0 ) ), lavaHash( i + vec3( 1.0, 1.0, 1.0 ) ), f.x ), f.y );
  return mix( a, b, f.z );
}`;
const FRAGMENT_BODY = `
vec3 lavaP = vLavaPos * uScale + vec3( 0.0, uTime * 0.35, uTime * 0.2 );
float lavaA = lavaNoise( lavaP );
float lavaVein = 1.0 - smoothstep( 0.0, 0.12, abs( lavaA - 0.5 ) );
float lavaB = lavaNoise( lavaP * 2.1 - uTime * 0.15 );
lavaVein = max( lavaVein, ( 1.0 - smoothstep( 0.0, 0.08, abs( lavaB - 0.5 ) ) ) * 0.6 );
vec3 lavaCol = mix( uLava, uLavaHot, lavaB );
totalEmissiveRadiance += lavaCol * lavaVein * ( uGlow + uTelegraph * 1.5 );`;

interface Patchable {
  uniforms: Record<string, { value: unknown }>;
  vertexShader: string;
  fragmentShader: string;
}

/** Injects the scrolling lava into a MeshStandardMaterial's shader (an `onBeforeCompile` body). */
export function patchLavaShader(shader: Patchable, u: SlagmawUniforms): void {
  for (const [k, v] of Object.entries(u)) shader.uniforms[k] = v;
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', `#include <common>\n${VERTEX_DECL}`)
    .replace('#include <begin_vertex>', `#include <begin_vertex>${VERTEX_BODY}`);
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', `#include <common>${FRAGMENT_DECL}`)
    .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>${FRAGMENT_BODY}`);
}

const GLOW_HOT = 1.2;
const GLOW_COOLED = 0.12;
/** How far below the floor a fully buried segment sits (m). */
const BURY_DEPTH = LOOK.headRadius * 2.4;
/** How high the middle of the arc rises over the floor line (m). */
const ARC_HEIGHT = 1.4;

/**
 * Builds the Slagmaw: a segmented lava worm made of spheres (head plus LOOK.segments - 1 body segments tapering to the tail),
 * all sharing one crust material with a scrolling lava shader. Fully procedural, no assets.
 */
export function buildSlagmawModel(): SlagmawModel {
  const root = new THREE.Group();
  root.name = 'boss-the-slagmaw';
  const body = new THREE.Group();
  body.name = 'slagmaw-body';
  root.add(body);

  const uniforms: SlagmawUniforms = {
    uTime: { value: 0 },
    uGlow: { value: GLOW_HOT },
    uTelegraph: { value: 0 },
    uLava: { value: new THREE.Color(LOOK.lavaColor) },
    uLavaHot: { value: new THREE.Color(LOOK.lavaHot) },
    uScale: { value: 1.6 },
  };
  const material = new THREE.MeshStandardMaterial({ color: LOOK.crustColor, roughness: 0.9, metalness: 0.05, emissive: 0x000000 });
  material.name = 'slagmaw-crust';
  material.userData.slagmawUniforms = uniforms;
  material.onBeforeCompile = (shader) => patchLavaShader(shader as unknown as Patchable, uniforms);
  material.customProgramCacheKey = () => 'slagmaw-lava';

  const geometry = new THREE.SphereGeometry(1, 16, 12);
  const n = Math.max(2, LOOK.segments);
  const parts: { node: THREE.Group; radius: number; index: number }[] = [];
  for (let i = 0; i < n; i++) {
    const k = i / (n - 1);
    const radius = THREE.MathUtils.lerp(LOOK.headRadius, LOOK.tailRadius, k);
    const node = new THREE.Group();
    node.name = i === 0 ? HEAD_BONE : segmentBone(i);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.scale.setScalar(radius);
    mesh.castShadow = true;
    mesh.name = `${node.name}-mesh`;
    node.add(mesh);
    body.add(node);
    parts.push({ node, radius, index: i });
  }

  // Hurtboxes: head and the first three body segments, a capsule across each sphere along the body axis.
  const defs: HurtboxDef[] = parts.slice(0, 4).map((p) => ({
    name: p.index === 0 ? 'head' : `segment${p.index}`,
    bone: p.node.name,
    start: { x: 0, y: 0, z: -p.radius * 0.3 },
    end: { x: 0, y: 0, z: p.radius * 0.3 },
    radius: p.radius * 0.95,
  }));

  let emergence = 1;
  let swayT = 0;
  let cooled = false;
  let opacity = 1;
  let disposed = false;
  const crust = new THREE.Color(LOOK.crustColor);
  const cooledCol = new THREE.Color(LOOK.cooledColor);

  const layout = (): void => {
    for (const p of parts) {
      const i = p.index;
      // Segments rise one after another: the head leads, the tail follows.
      const local = THREE.MathUtils.clamp(emergence * (1 + n * 0.12) - i * 0.12, 0, 1);
      const z = i * LOOK.segmentSpacing;
      // An arc: head high, the body dips back to the floor line toward the tail.
      const k = i / (n - 1);
      const up = p.radius * 0.6 + ARC_HEIGHT * Math.sin(Math.PI * Math.min(1, k * 0.9 + 0.1)) * (1 - k * 0.4);
      const y = THREE.MathUtils.lerp(-BURY_DEPTH - p.radius, up, local);
      const sway = Math.sin(swayT * 1.3 - i * 0.7) * 0.18 * local * (0.4 + k);
      p.node.position.set(sway, y, z);
      p.node.rotation.x = -Math.cos(Math.PI * k) * 0.25 * local;
    }
  };

  layout();
  root.updateMatrixWorld(true);
  const hurtboxes = new HurtboxSet(root, defs, body);

  const applyCooled = (): void => {
    material.color.copy(cooled ? cooledCol : crust);
    uniforms.uLava.value.set(cooled ? LOOK.cooledColor : LOOK.lavaColor);
    uniforms.uLavaHot.value.set(cooled ? LOOK.cooledColor : LOOK.lavaHot);
    uniforms.uGlow.value = cooled ? GLOW_COOLED : GLOW_HOT;
  };
  const headPos = new THREE.Vector3();

  return {
    root,
    owner: body,
    hurtboxes,
    setEmergence(e) {
      emergence = THREE.MathUtils.clamp(Number.isFinite(e) ? e : 0, 0, 1);
      root.visible = emergence >= HIDE_BELOW;
      layout();
    },
    setCooled(c) {
      cooled = !!c;
      applyCooled();
    },
    setTelegraph(t) {
      uniforms.uTelegraph.value = THREE.MathUtils.clamp(Number.isFinite(t) ? t : 0, 0, 1);
    },
    setOpacity(o) {
      opacity = THREE.MathUtils.clamp(Number.isFinite(o) ? o : 1, 0, 1);
      const transparent = opacity < 1;
      if (material.transparent !== transparent) material.needsUpdate = true;
      material.transparent = transparent;
      material.opacity = opacity;
    },
    faceToward(x, z) {
      const dx = x - root.position.x;
      const dz = z - root.position.z;
      if (!Number.isFinite(dx) || !Number.isFinite(dz) || Math.hypot(dx, dz) < 1e-6) return;
      // Yaw 0 faces -Z.
      root.rotation.y = Math.atan2(-dx, -dz);
    },
    update(dt) {
      if (!(dt > 0) || !Number.isFinite(dt)) return;
      uniforms.uTime.value += dt;
      swayT += dt;
      layout();
    },
    headWorld(out) {
      root.updateMatrixWorld(true);
      headPos.copy(parts[0].node.position);
      return out.copy(root.localToWorld(headPos));
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      hurtboxes.dispose();
      geometry.dispose();
      material.dispose();
      root.removeFromParent();
    },
  };
}
