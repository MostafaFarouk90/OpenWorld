// Instanced barley for the loft fields: crossed cards, seeded so a seed always gives the same field.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { pointInFootprint } from './geometry';
import type { FieldSpec, StructureSpec } from './layoutTypes';

export const MAX_BARLEY_INSTANCES = 8000;
const KEEP_OUT_MARGIN = 0.4;

/** R01's field state (`world.brightwater.barley`): unset leaves the barley as it was. */
export type BarleyVariant = 'unset' | 'scorched' | 'saved';

/** Reads the flag value; anything but the two known words counts as unset. */
export function barleyVariantOf(value: unknown): BarleyVariant {
  return value === 'scorched' || value === 'saved' ? value : 'unset';
}

/** Fraction of the cards that survive a scorching. */
export const SCORCHED_KEEP = 0.5;

export interface BarleyOptions {
  variant?: BarleyVariant;
  /** Only these fields take the variant (Wynn's field); default none. */
  variantFields?: readonly string[];
}

export interface BarleyHandle {
  object: THREE.Group;
  instanceCount: number;
  dispose(): void;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function cardGeometry(): THREE.BufferGeometry {
  const a = new THREE.PlaneGeometry(0.5, 1.0);
  a.translate(0, 0.5, 0);
  const b = a.clone();
  b.rotateY(Math.PI / 2);
  const merged = mergeGeometries([a, b]);
  a.dispose();
  b.dispose();
  return merged;
}

export function buildBarley(
  fields: FieldSpec[],
  heightAt: (x: number, z: number) => number,
  seed = 1,
  keepOut: StructureSpec[] = [],
  options: BarleyOptions = {},
): BarleyHandle {
  for (const f of fields) {
    if (![f.x0, f.z0, f.x1, f.z1].every(Number.isFinite) || f.x1 <= f.x0 || f.z1 <= f.z0) {
      throw new Error(`buildBarley: field "${f.id}" has invalid bounds`);
    }
    if (!Number.isFinite(f.count)) throw new Error(`buildBarley: field "${f.id}" has a non-finite count`);
  }
  const group = new THREE.Group();
  group.name = 'barley';
  const wanted = fields.map((f) => Math.max(0, Math.floor(f.count)));
  const total = wanted.reduce((s, n) => s + n, 0);
  const scale = total > MAX_BARLEY_INSTANCES ? MAX_BARLEY_INSTANCES / total : 1;

  const placed: Array<{ x: number; y: number; z: number; rot: number; s: number; tone: number; variant: BarleyVariant }> = [];
  fields.forEach((f, i) => {
    const rand = mulberry32(seed * 7919 + i * 104729);
    const variant = options.variantFields?.includes(f.id) ? (options.variant ?? 'unset') : 'unset';
    const n = Math.floor(wanted[i] * scale * (variant === 'scorched' ? SCORCHED_KEEP : 1));
    for (let k = 0; k < n; k++) {
      const x = f.x0 + rand() * (f.x1 - f.x0);
      const z = f.z0 + rand() * (f.z1 - f.z0);
      const rot = rand() * Math.PI;
      const s = 0.8 + rand() * 0.5;
      const tone = rand();
      if (keepOut.some((st) => pointInFootprint(st, x, z, KEEP_OUT_MARGIN))) continue;
      placed.push({ x, y: heightAt(x, z), z, rot, s: variant === 'scorched' ? s * 0.7 : s, tone, variant });
    }
  });

  if (placed.length === 0) {
    return { object: group, instanceCount: 0, dispose: () => void group.removeFromParent() };
  }
  const geometry = cardGeometry();
  const material = new THREE.MeshLambertMaterial({ color: 0xffffff, side: THREE.DoubleSide, flatShading: true });
  const mesh = new THREE.InstancedMesh(geometry, material, placed.length);
  mesh.name = 'barley-instances';
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const col = new THREE.Color();
  placed.forEach((p, i) => {
    q.setFromAxisAngle(up, p.rot);
    m.compose(new THREE.Vector3(p.x, p.y, p.z), q, new THREE.Vector3(p.s, p.s, p.s));
    mesh.setMatrixAt(i, m);
    if (p.variant === 'scorched') col.setHSL(0.06 + p.tone * 0.02, 0.15, 0.14 + p.tone * 0.08);
    else if (p.variant === 'saved') col.setHSL(0.13 + p.tone * 0.03, 0.7, 0.5 + p.tone * 0.12);
    else col.setHSL(0.12 + p.tone * 0.03, 0.55, 0.45 + p.tone * 0.12);
    mesh.setColorAt(i, col);
  });
  mesh.instanceMatrix.needsUpdate = true;
  mesh.frustumCulled = false;
  group.add(mesh);
  let disposed = false;
  return {
    object: group,
    instanceCount: placed.length,
    dispose() {
      if (disposed) return;
      disposed = true;
      mesh.dispose();
      geometry.dispose();
      material.dispose();
      group.removeFromParent();
      group.clear();
    },
  };
}
