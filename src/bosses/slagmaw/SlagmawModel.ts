import * as THREE from 'three';
import { HurtboxSet } from '../../combat/HurtboxSet';
import type { HurtboxDef } from '../../combat/types';
import { LOOK } from './tuning';

/** Live uniforms of the lava shader, kept on `material.userData.slagmawUniforms` (tests and debug read them; no recompile needed). */
export interface SlagmawUniforms {
  uLavaTime: { value: number };
  /** 0..1 how much lava shows through the crust (cooled dims it). */
  uGlow: { value: number };
  /** 0..1 added glow for the tremor build-up and spit wind-up. */
  uLavaTelegraph: { value: number };
  uLava: { value: THREE.Color };
  uLavaHot: { value: THREE.Color };
  uScale: { value: number };
  /** 0 hot .. 1 cooled: blends the crust colour to the cooled one in the shader (the actor FX clones the material, so material.color cannot). */
  uCooled: { value: number };
  uCooledColor: { value: THREE.Color };
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
uniform float uLavaTime;
uniform float uGlow;
uniform float uLavaTelegraph;
uniform vec3 uLava;
uniform vec3 uLavaHot;
uniform float uScale;
uniform float uCooled;
uniform vec3 uCooledColor;
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
diffuseColor.rgb = mix( diffuseColor.rgb, uCooledColor, uCooled );
vec3 lavaP = vLavaPos * uScale + vec3( 0.0, uLavaTime * 0.35, uLavaTime * 0.2 );
float lavaA = lavaNoise( lavaP );
float lavaVein = 1.0 - smoothstep( 0.0, 0.07, abs( lavaA - 0.5 ) );
float lavaB = lavaNoise( lavaP * 2.1 - uLavaTime * 0.15 );
lavaVein = max( lavaVein, ( 1.0 - smoothstep( 0.0, 0.05, abs( lavaB - 0.5 ) ) ) * 0.5 );
vec3 lavaCol = mix( uLava, uLavaHot, lavaB );
totalEmissiveRadiance += lavaCol * lavaVein * ( uGlow + uLavaTelegraph * 1.5 );`;

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

const GLOW_HOT = 0.8;
const GLOW_COOLED = 0.1;
/** How far below the floor a fully buried segment sits (m). */
const BURY_DEPTH = LOOK.headRadius * 2.4;
/** How high the middle of the arc rises over the floor line (m). */
const ARC_HEIGHT = 1.8;

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
    uLavaTime: { value: 0 },
    uGlow: { value: GLOW_HOT },
    uLavaTelegraph: { value: 0 },
    uLava: { value: new THREE.Color(LOOK.lavaColor) },
    uLavaHot: { value: new THREE.Color(LOOK.lavaHot) },
    uScale: { value: 1.6 },
    uCooled: { value: 0 },
    uCooledColor: { value: new THREE.Color(LOOK.cooledColor) },
  };
  const material = new THREE.MeshStandardMaterial({ color: LOOK.crustColor, roughness: 0.9, metalness: 0.05, emissive: LOOK.crustEmber });
  material.name = 'slagmaw-crust';
  material.userData.slagmawUniforms = uniforms;
  material.onBeforeCompile = (shader) => patchLavaShader(shader as unknown as Patchable, uniforms);
  material.customProgramCacheKey = () => 'slagmaw-lava';

  const geometry = new THREE.SphereGeometry(1, 20, 14);
  const JAW_GEO = new THREE.ConeGeometry(0.2 * LOOK.headRadius, 1.9 * LOOK.headRadius, 7);
  JAW_GEO.translate(0, 0.95 * LOOK.headRadius, 0); // pivot at the base so the tip swings
  const FIN_GEO = new THREE.ConeGeometry(0.5, 1, 4);
  FIN_GEO.rotateY(Math.PI / 4);
  const EYE_GEO = new THREE.SphereGeometry(0.15 * LOOK.headRadius, 10, 8);
  const plateMaterial = new THREE.MeshStandardMaterial({ color: LOOK.plateColor, roughness: 0.8, metalness: 0.15, emissive: LOOK.plateEmber, emissiveIntensity: 0.35 });
  plateMaterial.name = 'slagmaw-plate';
  const eyeMaterial = new THREE.MeshBasicMaterial({ color: LOOK.lavaHot });
  eyeMaterial.name = 'slagmaw-eye';
  // The lava seam between two segments and the glowing mouth: unlit, so they read as molten from any angle.
  const seamMaterial = new THREE.MeshBasicMaterial({ color: LOOK.lavaColor });
  seamMaterial.name = 'slagmaw-seam';
  const extras = [plateMaterial, eyeMaterial, seamMaterial];
  const n = Math.max(2, LOOK.segments);
  const parts: { node: THREE.Group; radius: number; index: number }[] = [];
  const up = new THREE.Vector3(0, 1, 0);
  for (let i = 0; i < n; i++) {
    const k = i / (n - 1);
    const radius = THREE.MathUtils.lerp(LOOK.headRadius, LOOK.tailRadius, k);
    const node = new THREE.Group();
    node.name = i === 0 ? HEAD_BONE : segmentBone(i);
    const mesh = new THREE.Mesh(geometry, material);
    // Each segment is a flattened drum: short along the body so the joints pinch hard.
    const half = LOOK.segmentSpacing * 0.56;
    mesh.scale.set(radius, radius * 0.95, Math.min(half, radius));
    if (i === 1) mesh.scale.x *= 0.85; // the neck is slimmer than the skull and the first body drum
    mesh.castShadow = true;
    mesh.name = `${node.name}-mesh`;
    node.add(mesh);
    if (i === 0) {
      // A heavy skull: long, with a brow ridge, two big mandibles and a glowing maw on the face (-Z).
      mesh.scale.set(radius * 1.12, radius * 1.0, radius * 1.35);
      const brow = new THREE.Mesh(geometry, plateMaterial);
      brow.scale.set(radius * 0.95, radius * 0.22, radius * 0.5);
      brow.position.set(0, radius * 0.52, -radius * 0.72);
      brow.rotation.x = 0.5;
      brow.castShadow = true;
      const mouth = new THREE.Mesh(geometry, eyeMaterial);
      mouth.scale.set(radius * 0.6, radius * 0.3, radius * 0.4);
      mouth.position.set(0, -radius * 0.32, -radius * 1.25);
      node.add(brow, mouth);
      for (const side of [-1, 1]) {
        const jaw = new THREE.Mesh(JAW_GEO, plateMaterial);
        jaw.position.set(side * radius * 0.6, -radius * 0.3, -radius * 1.15);
        jaw.quaternion.setFromUnitVectors(up, new THREE.Vector3(-side * 0.5, 0.08, -1).normalize());
        jaw.castShadow = true;
        const eye = new THREE.Mesh(EYE_GEO, eyeMaterial);
        eye.position.set(side * radius * 0.5, radius * 0.28, -radius * 1.1);
        node.add(jaw, eye);
      }
    } else {
      // A tall dorsal blade on every body segment plus flank spines on the front ones, so the line reads as an armoured worm.
      const fin = new THREE.Mesh(FIN_GEO, plateMaterial);
      fin.scale.set(radius * 0.45, radius * 1.05, radius * 1.5);
      fin.position.y = radius * 0.95;
      fin.castShadow = true;
      node.add(fin);
      if (i <= 6) {
        for (const side of [-1, 1]) {
          const spine = new THREE.Mesh(FIN_GEO, plateMaterial);
          spine.scale.set(radius * 0.3, radius * 0.75, radius * 0.9);
          spine.position.set(side * radius * 0.78, radius * 0.5, 0);
          spine.rotation.z = -side * 1.0;
          spine.castShadow = true;
          node.add(spine);
        }
      }
    }
    body.add(node);
    parts.push({ node, radius, index: i });
  }
  // A glowing seam sphere in each joint, between segment i-1 and i (positioned in layout()).
  const seams: THREE.Mesh[] = [];
  for (let i = 1; i < n; i++) {
    const s = new THREE.Mesh(geometry, seamMaterial);
    s.name = `slagmaw-seam-${i}`;
    s.scale.setScalar(parts[i].radius * 0.7);
    body.add(s);
    seams.push(s);
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
    for (let i = 1; i < n; i++) {
      const a = parts[i - 1].node.position;
      const b = parts[i].node.position;
      seams[i - 1].position.set((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
    }
  };

  layout();
  root.updateMatrixWorld(true);
  const hurtboxes = new HurtboxSet(root, defs, body);

  const applyCooled = (): void => {
    uniforms.uCooled.value = cooled ? 1 : 0;
    uniforms.uLava.value.set(cooled ? LOOK.cooledColor : LOOK.lavaColor);
    uniforms.uLavaHot.value.set(cooled ? LOOK.cooledColor : LOOK.lavaHot);
    uniforms.uGlow.value = cooled ? GLOW_COOLED : GLOW_HOT;
    material.emissive.set(cooled ? LOOK.crustEmberCooled : LOOK.crustEmber);
    plateMaterial.color.set(cooled ? LOOK.plateCooled : LOOK.plateColor);
    plateMaterial.emissiveIntensity = cooled ? 0.0 : 0.35;
    seamMaterial.color.set(cooled ? LOOK.seamCooled : LOOK.lavaColor);
    eyeMaterial.color.set(cooled ? LOOK.seamCooled : LOOK.lavaHot);
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
      uniforms.uLavaTelegraph.value = THREE.MathUtils.clamp(Number.isFinite(t) ? t : 0, 0, 1);
    },
    setOpacity(o) {
      opacity = THREE.MathUtils.clamp(Number.isFinite(o) ? o : 1, 0, 1);
      const transparent = opacity < 1;
      for (const m of [material, ...extras]) {
        if (m.transparent !== transparent) m.needsUpdate = true;
        m.transparent = transparent;
        m.opacity = opacity;
      }
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
      uniforms.uLavaTime.value += dt;
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
      JAW_GEO.dispose();
      FIN_GEO.dispose();
      seamMaterial.dispose();
      EYE_GEO.dispose();
      plateMaterial.dispose();
      eyeMaterial.dispose();
      material.dispose();
      root.removeFromParent();
    },
  };
}
