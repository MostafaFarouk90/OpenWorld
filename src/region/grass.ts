// Meadow grass around the player (design 14: "instanced grass cards (procedural)"): tufts of three crossed blades,
// scattered per ground cell from a seed so a cell always grows the same grass, rebuilt only when the player crosses a
// cell. Built-in Lambert material, no custom shader, so nothing here can fail to compile on a weaker GPU.
import * as THREE from 'three';
import { surfaceColor } from '../terrain/chunkGeometry';
import { grassRule } from '../terrain/ground';
import { tintAsh } from '../terrain/shape/detailGround';

export const GRASS = {
  /** Side of one scatter cell (m). */
  cellSize: 8,
  /** Cells grown in each direction from the player's cell: (2r + 1)^2 cells. */
  radiusCells: 5,
  /** Tufts per cell at density 1. */
  perCell: 56,
  /** No grass above this height (the heath and snow bands of the terrain palette). */
  maxHeight: 140,
  /** No grass where the ground normal's y is below this (the terrain shows bare rock from 0.82). */
  minUp: 0.86,
  /** Hidden when the player stands this far above the ground (interiors sit 150 m up). */
  hideAbove: 30,
  /** Cells this far beyond the radius stay cached so walking back and forth does not re-scatter. */
  cacheSlack: 2,
  /** Beyond this fraction of the patch radius tufts thin out, down to `edgeKeep` of them at the rim. */
  thinFrom: 0.5,
  edgeKeep: 0.35,
  /**
   * New cells scattered per frame, nearest first (an arrival grows the 3 x 3 under the player at once). A cell costs
   * about 0.35 ms in node without the collider rays, so a whole new row at once would hitch; the far edge fills in
   * over a few frames instead.
   */
  cellsPerFrame: 3,
} as const;

/** Triangles in one tuft: three blades, each written with both windings. */
export const GRASS_TRIANGLES_PER_TUFT = 6;
/** Hard cap on instances: every cell of the patch at full density. One InstancedMesh, so one draw call. */
export const GRASS_MAX_INSTANCES = (2 * GRASS.radiusCells + 1) ** 2 * GRASS.perCell;
export const GRASS_MAX_TRIANGLES = GRASS_MAX_INSTANCES * GRASS_TRIANGLES_PER_TUFT;

export interface Tuft {
  x: number;
  /** Ground height, read once when the cell is scattered. */
  y: number;
  z: number;
  rot: number;
  scale: number;
  tone: number;
  /** Linear RGB: the terrain's own colour under the tuft (the meadow band, drying a little with height), lifted. */
  color: [number, number, number];
}

/** Blades are a little lighter than the ground they grow from, by 1 + this * (0.5 + tone). */
export const GRASS_LIFT = 0.35;
/** Share of that lift taken away on fully grey B4 ash ground. */
export const ASH_LIFT_CUT = 0.7;

/**
 * The colour of a tuft standing on ground of this height and steepness: the terrain's colour, lifted by `tone`. Given
 * (x, z), an Act 2 ground rule there (terrain/ground.ts) swaps in its own grass colour by its weight: Cinderreach's
 * yellow, Oldsmoke's rust; the B4 ash reach drains it grey like its ground. Without (x, z), or where neither reaches, the colour is
 * Act 1's exactly.
 */
export function tuftColor(height: number, up: number, tone: number, x?: number, z?: number): [number, number, number] {
  const c = new Float32Array(3);
  surfaceColor(height, up, c, 0);
  let ash = 0;
  if (x !== undefined && z !== undefined) {
    const rule = grassRule(x, z);
    if (rule.tint) for (let i = 0; i < 3; i++) c[i] += (rule.tint[i] - c[i]) * rule.weight;
    // The B4 ash reach greys its ground; the blades growing on it follow (identity outside the reach), lifted less so the dry
    // blades read as grey grass on grey ground instead of pale spikes.
    ash = tintAsh(x, z, c, 0);
  }
  const k = 1 + GRASS_LIFT * (0.5 + tone) * (1 - ASH_LIFT_CUT * ash);
  return [Math.min(c[0] * k, 1), Math.min(c[1] * k, 1), Math.min(c[2] * k, 1)];
}

export type GrassAccept = (x: number, z: number) => boolean;
/** A sparser, drier blade mix for trodden lawn (the Harrowmark wards' CITY_LAWN): `keep` of the tufts grow, tinted `dry` of the way to DRY_BLADE. */
export interface GrassMix {
  keep: number;
  dry: number;
}
export type GrassMixFn = (x: number, z: number) => GrassMix | null;
/** Linear RGB of a dry, trodden-down blade (straw). */
export const DRY_BLADE: readonly [number, number, number] = [0.42, 0.36, 0.14];
export type HeightFn = (x: number, z: number) => number;

/** A seed per cell: the same cell always gives the same random stream. */
function cellRandom(cx: number, cz: number, seed: number): () => number {
  let a = (Math.imul(cx, 73856093) ^ Math.imul(cz, 19349663) ^ Math.imul(seed, 83492791)) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The ground's normal y at (x, z), from central differences 0.5 m apart. */
export function groundUp(heightAt: HeightFn, x: number, z: number): number {
  const e = 0.5;
  const dx = (heightAt(x + e, z) - heightAt(x - e, z)) / (2 * e);
  const dz = (heightAt(x, z + e) - heightAt(x, z - e)) / (2 * e);
  return 1 / Math.sqrt(1 + dx * dx + dz * dz);
}

/**
 * The tufts of one cell. Every candidate is drawn whatever the outcome so a rejected tuft never shifts the rest;
 * `density` keeps the first `round(perCell * density)` candidates. Pure and deterministic.
 */
export function cellTufts(cx: number, cz: number, heightAt: HeightFn, accept: GrassAccept, density = 1, seed = 5, mix?: GrassMixFn): Tuft[] {
  const rand = cellRandom(cx, cz, seed);
  const n = Math.round(GRASS.perCell * Math.min(Math.max(density, 0), 1));
  const out: Tuft[] = [];
  for (let i = 0; i < GRASS.perCell; i++) {
    const x = (cx + rand()) * GRASS.cellSize;
    const z = (cz + rand()) * GRASS.cellSize;
    const rot = rand() * Math.PI;
    const scale = 0.7 + rand() * 0.6;
    const tone = rand();
    if (i >= n) continue;
    // A thinner ground rule (Oldsmoke keeps 0.4) drops the later candidates, as `density` does.
    const rule = grassRule(x, z);
    if (rule.density < 1 && i >= GRASS.perCell * rule.density) continue;
    const y = heightAt(x, z);
    if (!Number.isFinite(y) || y > GRASS.maxHeight) continue;
    const up = groundUp(heightAt, x, z);
    if (up < GRASS.minUp) continue;
    if (!accept(x, z)) continue;
    const m = mix?.(x, z) ?? null;
    if (m && i >= GRASS.perCell * m.keep) continue;
    const color = tuftColor(y, up, tone, x, z);
    if (m) for (let k = 0; k < 3; k++) color[k] += (DRY_BLADE[k]! * (0.8 + 0.4 * tone) - color[k]) * m.dry;
    out.push({ x, y, z, rot, scale: m ? scale * 0.8 : scale, tone, color });
  }
  return out;
}

/**
 * Three narrow blades crossed at 60 degrees, each one triangle written with both windings (a double-sided material
 * would flip the normal on the back face and draw it dark), rooted at the origin.
 */
export function tuftGeometry(): THREE.BufferGeometry {
  const pos: number[] = [];
  for (let k = 0; k < 3; k++) {
    const a = (k * Math.PI) / 3;
    const c = Math.cos(a) * 0.09;
    const s = Math.sin(a) * 0.09;
    // A slight lean so the tuft does not read as a stiff star.
    const lx = Math.sin(a + 1) * 0.08;
    const lz = Math.cos(a + 1) * 0.08;
    pos.push(-c, 0, -s, c, 0, s, lx, 0.5, lz, c, 0, s, -c, 0, -s, lx, 0.5, lz);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  // Blades lit from above whatever their facing: every normal points up so both sides read the same green.
  g.setAttribute('normal', new THREE.Float32BufferAttribute(Array.from({ length: pos.length / 3 }, () => [0, 1, 0]).flat(), 3));
  return g;
}

export class GrassField {
  readonly object = new THREE.Group();
  private readonly mesh: THREE.InstancedMesh;
  private readonly geometry = tuftGeometry();
  private readonly material = new THREE.MeshLambertMaterial({ color: 0xffffff });
  private readonly cache = new Map<string, Tuft[]>();
  private centre: { cx: number; cz: number } | null = null;
  private dirty = false;
  private density: number;
  /** Cell offsets within the patch, nearest first. */
  private static readonly offsets: ReadonlyArray<readonly [number, number]> = (() => {
    const r = GRASS.radiusCells;
    const out: Array<[number, number]> = [];
    for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) out.push([dx, dz]);
    return out.sort((a, b) => Math.hypot(...a) - Math.hypot(...b));
  })();
  private disposed = false;
  /** Instances drawn after the last rebuild. */
  count = 0;

  constructor(
    private readonly heightAt: HeightFn,
    private readonly accept: GrassAccept,
    density = 1,
    private readonly cellsPerFrame: number = GRASS.cellsPerFrame,
    private readonly mix?: GrassMixFn,
  ) {
    this.density = clampDensity(density);
    this.mesh = new THREE.InstancedMesh(this.geometry, this.material, GRASS_MAX_INSTANCES);
    this.mesh.name = 'grass-instances';
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.object.name = 'grass';
    this.object.add(this.mesh);
  }

  /**
   * Call every frame. Follows the player: on entering another cell the patch moves, and missing cells are scattered
   * up to `cellsPerFrame` a frame, nearest first. Hidden (and idle) while the player is far above the ground.
   * Returns true when the instances were rewritten.
   */
  update(x: number, y: number, z: number): boolean {
    if (this.disposed || !Number.isFinite(x) || !Number.isFinite(z)) return false;
    const ground = this.heightAt(x, z);
    this.object.visible = !(Number.isFinite(y) && Number.isFinite(ground) && y - ground > GRASS.hideAbove);
    if (!this.object.visible) return false;
    const cx = Math.floor(x / GRASS.cellSize);
    const cz = Math.floor(z / GRASS.cellSize);
    let budget = this.cellsPerFrame;
    if (!this.centre || this.centre.cx !== cx || this.centre.cz !== cz) {
      // An arrival (load, fast travel, respawn, a door) lands in bare cells: grow the 3 x 3 under the player at once.
      if (!this.centre || Math.max(Math.abs(this.centre.cx - cx), Math.abs(this.centre.cz - cz)) > 1) budget = Math.max(budget, 9);
      this.centre = { cx, cz };
      this.evict();
      this.dirty = true;
    }
    for (const [dx, dz] of GrassField.offsets) {
      if (budget <= 0) break;
      const key = `${cx + dx},${cz + dz}`;
      if (this.cache.has(key)) continue;
      this.cache.set(key, cellTufts(cx + dx, cz + dz, this.heightAt, this.accept, this.density, 5, this.mix));
      budget--;
      this.dirty = true;
    }
    if (!this.dirty) return false;
    this.dirty = false;
    this.rebuild();
    return true;
  }

  /** True once every cell of the current patch has been scattered. */
  get complete(): boolean {
    if (!this.centre) return false;
    const { cx, cz } = this.centre;
    return GrassField.offsets.every(([dx, dz]) => this.cache.has(`${cx + dx},${cz + dz}`));
  }

  /** Quality: 0..1 of the tufts; re-scatters the cached cells. */
  setDensity(density: number): void {
    const d = clampDensity(density);
    if (d === this.density) return;
    this.density = d;
    // Re-scattered by the next updates, nearest first.
    this.cache.clear();
    this.dirty = true;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.mesh.dispose();
    this.geometry.dispose();
    this.material.dispose();
    this.object.removeFromParent();
    this.object.clear();
    this.cache.clear();
  }

  private evict(): void {
    const { cx, cz } = this.centre!;
    const keep = GRASS.radiusCells + GRASS.cacheSlack;
    for (const key of this.cache.keys()) {
      const [kx, kz] = key.split(',').map(Number);
      if (Math.abs(kx - cx) > keep || Math.abs(kz - cz) > keep) this.cache.delete(key);
    }
  }

  private rebuild(): void {
    const { cx, cz } = this.centre!;
    const r = GRASS.radiusCells;
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    const p = new THREE.Vector3();
    const s = new THREE.Vector3();
    const col = new THREE.Color();
    const reach = (r + 0.5) * GRASS.cellSize;
    const px = (cx + 0.5) * GRASS.cellSize;
    const pz = (cz + 0.5) * GRASS.cellSize;
    let i = 0;
    for (let dz = -r; dz <= r; dz++) {
      for (let dx = -r; dx <= r; dx++) {
        const key = `${cx + dx},${cz + dz}`;
        const tufts = this.cache.get(key);
        if (!tufts) continue;
        for (const t of tufts) {
          // Far tufts thin out and shrink, so the patch fades instead of ending in a hard edge (and costs less).
          const d = Math.hypot(t.x - px, t.z - pz) / reach;
          if (d >= 1 || i >= GRASS_MAX_INSTANCES) continue;
          if (d > GRASS.thinFrom && t.tone > 1 - ((d - GRASS.thinFrom) / (1 - GRASS.thinFrom)) * (1 - GRASS.edgeKeep)) continue;
          const fade = d < 0.7 ? 1 : 1 - (d - 0.7) / 0.3;
          const sc = t.scale * fade;
          q.setFromAxisAngle(up, t.rot);
          m.compose(p.set(t.x, t.y, t.z), q, s.set(sc, sc, sc));
          this.mesh.setMatrixAt(i, m);
          col.setRGB(t.color[0], t.color[1], t.color[2], THREE.LinearSRGBColorSpace);
          this.mesh.setColorAt(i, col);
          i++;
        }
      }
    }
    this.count = i;
    this.mesh.count = i;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}

function clampDensity(d: number): number {
  return Number.isFinite(d) ? Math.min(Math.max(d, 0), 1) : 1;
}

/** Distance from (x, z) to a polyline in the XZ plane. */
export function distanceToPolyline(points: readonly (readonly [number, number])[], x: number, z: number): number {
  let best = Infinity;
  for (let i = 0; i < points.length - 1; i++) {
    const [ax, az] = points[i];
    const [bx, bz] = points[i + 1];
    const vx = bx - ax;
    const vz = bz - az;
    const len2 = vx * vx + vz * vz;
    const t = len2 > 0 ? Math.min(Math.max(((x - ax) * vx + (z - az) * vz) / len2, 0), 1) : 0;
    best = Math.min(best, Math.hypot(x - (ax + vx * t), z - (az + vz * t)));
  }
  if (points.length === 1) best = Math.hypot(x - points[0][0], z - points[0][1]);
  return best;
}
