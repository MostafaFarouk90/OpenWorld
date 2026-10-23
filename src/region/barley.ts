// Instanced barley for the loft fields: crossed cards, seeded so a seed always gives the same field.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { pointInFootprint } from './geometry';
import type { FieldSpec, StructureSpec } from './layoutTypes';

export const MAX_BARLEY_INSTANCES = 8000;
/** Spacing of the tilled rows (along z) and the width of the raised ridge in each. Barley cards are planted on the ridges. */
export const ROW_SPACING = 1.5;
const RIDGE_WIDTH = 0.7;
const BORDER_WIDTH = 0.6;
const SOIL_STEP = 2.5;
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

const FURROW = new THREE.Color(0x4a3524);
const RIDGE = new THREE.Color(0x7d5c38);
const BANK = new THREE.Color(0x3f2e1f);

/** Row centres (x) of a field: one per `ROW_SPACING`, inset so the first and last sit inside the border. */
export function rowCentres(f: FieldSpec): number[] {
  const out: number[] = [];
  const n = Math.max(1, Math.floor((f.x1 - f.x0 - BORDER_WIDTH * 2) / ROW_SPACING));
  const x0 = (f.x0 + f.x1) / 2 - ((n - 1) * ROW_SPACING) / 2;
  for (let i = 0; i < n; i++) out.push(x0 + i * ROW_SPACING);
  return out;
}

/**
 * Tilled soil for the fields: a dark furrow strip and a lighter raised ridge per row, with a low dark bank around the edge,
 * all draped on the terrain in one vertex-coloured mesh. Strips whose middle falls inside a keep-out footprint are skipped.
 */
function buildSoil(
  fields: FieldSpec[],
  heightAt: (x: number, z: number) => number,
  keepOut: StructureSpec[],
): THREE.Mesh | null {
  const pos: number[] = [];
  const colors: number[] = [];
  const idx: number[] = [];
  const blocked = (x: number, z: number): boolean => keepOut.some((st) => pointInFootprint(st, x, z, KEEP_OUT_MARGIN));
  // A strip from (ax,az) to (bx,bz), `half` wide across the other axis, `lift` above the ground.
  const strip = (ax: number, az: number, bx: number, bz: number, half: number, lift: number, c: THREE.Color): void => {
    if (blocked((ax + bx) / 2, (az + bz) / 2)) return;
    const alongZ = Math.abs(bz - az) >= Math.abs(bx - ax);
    const base = pos.length / 3;
    const corners: Array<[number, number]> = alongZ
      ? [[ax - half, az], [ax + half, az], [bx + half, bz], [bx - half, bz]]
      : [[ax, az - half], [ax, az + half], [bx, bz + half], [bx, bz - half]];
    for (const [x, z] of corners) {
      pos.push(x, heightAt(x, z) + lift, z);
      colors.push(c.r, c.g, c.b);
    }
    idx.push(base, base + 2, base + 1, base, base + 3, base + 2);
  };
  const tmp = new THREE.Color();
  for (const f of fields) {
    const rows = rowCentres(f);
    const z0 = f.z0 + BORDER_WIDTH;
    const z1 = f.z1 - BORDER_WIDTH;
    const steps = Math.max(1, Math.ceil((z1 - z0) / SOIL_STEP));
    rows.forEach((x, r) => {
      for (let k = 0; k < steps; k++) {
        const a = z0 + ((z1 - z0) * k) / steps;
        const b = z0 + ((z1 - z0) * (k + 1)) / steps;
        strip(x, a, x, b, ROW_SPACING / 2, 0.04, FURROW);
        const shade = 0.9 + ((r * 7 + k * 3) % 5) * 0.04;
        strip(x, a, x, b, RIDGE_WIDTH / 2, 0.1, tmp.copy(RIDGE).multiplyScalar(shade));
      }
    });
    // Low bank on all four edges.
    const h = BORDER_WIDTH / 2;
    const bank = 0.22;
    for (let k = 0; k < Math.ceil((f.z1 - f.z0) / SOIL_STEP); k++) {
      const a = f.z0 + k * SOIL_STEP;
      const b = Math.min(f.z1, a + SOIL_STEP);
      strip(f.x0 + h, a, f.x0 + h, b, h, bank, BANK);
      strip(f.x1 - h, a, f.x1 - h, b, h, bank, BANK);
    }
    for (let k = 0; k < Math.ceil((f.x1 - f.x0) / SOIL_STEP); k++) {
      const a = f.x0 + k * SOIL_STEP;
      const b = Math.min(f.x1, a + SOIL_STEP);
      strip(a, f.z0 + h, b, f.z0 + h, h, bank, BANK);
      strip(a, f.z1 - h, b, f.z1 - h, h, bank, BANK);
    }
  }
  if (idx.length === 0) return null;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
  const mesh = new THREE.Mesh(g, mat);
  mesh.name = 'barley-soil';
  mesh.frustumCulled = false;
  return mesh;
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
    const rows = rowCentres(f);
    for (let k = 0; k < n; k++) {
      // Planted in rows: a ridge picked at random, a little jitter across it, anywhere along it.
      const x = rows[Math.floor(rand() * rows.length)] + (rand() - 0.5) * (RIDGE_WIDTH * 0.7);
      const z = f.z0 + BORDER_WIDTH + rand() * (f.z1 - f.z0 - BORDER_WIDTH * 2);
      const rot = rand() * Math.PI;
      const s = 0.8 + rand() * 0.5;
      const tone = rand();
      if (keepOut.some((st) => pointInFootprint(st, x, z, KEEP_OUT_MARGIN))) continue;
      placed.push({ x, y: heightAt(x, z), z, rot, s: variant === 'scorched' ? s * 0.7 : s, tone, variant });
    }
  });

  const soil = buildSoil(fields, heightAt, keepOut);
  if (placed.length === 0) {
    if (soil) group.add(soil);
    return {
      object: group,
      instanceCount: 0,
      dispose: () => {
        group.removeFromParent();
        if (soil) {
          soil.geometry.dispose();
          (soil.material as THREE.Material).dispose();
        }
      },
    };
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
  if (soil) group.add(soil);
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
      if (soil) {
        soil.geometry.dispose();
        (soil.material as THREE.Material).dispose();
      }
      group.removeFromParent();
      group.clear();
    },
  };
}
