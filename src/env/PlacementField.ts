// Draws a tile's placement rows: every row resolves to a model (src/env/resolve.ts), rows sharing a model and tint become one
// InstancedMesh per part, grouped by class (trees, bushes, ground cover, ...) so a class can be hidden by distance and thinned by
// quality. Instances are added in a fixed pseudo-random priority order, so lowering the density drops the same ones every time.
import * as THREE from 'three';
import { InstancedModel } from '../assets/instancing';
import type { ModelLibrary, ModelTemplate } from '../assets/swap/ModelLibrary';
import { placeholderGeometry, placeholderMaterial } from './placeholders';
import { expandPatches } from './patches';
import { hueMatrix, resolveModel, type ModelRef, type Tint } from './resolve';

export interface PlacementRow {
  id: string;
  x: number;
  z: number;
  yaw?: number;
  scale?: number;
  /** Patch rows only (ids in src/env/patches.ts): the spread radius in metres, default 0.8 x scale. */
  spread?: number;
  /** Patch rows only: the number of tufts (1 or more), default 5 + 4 x scale clamped to 6..14. */
  n?: number;
}

export type PlacementClass = 'tree' | 'bush' | 'rock' | 'wood' | 'ground' | 'prop' | 'hedge';

/** Hide a class when the player is further than this from its nearest instance sphere edge (metres). */
export const CLASS_RANGE: Readonly<Record<PlacementClass, number>> = { tree: 700, bush: 260, rock: 420, wood: 160, ground: 56, prop: 260, hedge: 320 };
/**
 * Ground cover's base colour is multiplied by this: a clump's texture is a deep green that lit like the vegetation reads near
 * black against the pale meadow once it is only a pixel or two across, so it is lifted toward the ground it sits on.
 */
export const GROUND_LIFT = 1.45;
/** Emissive colour added to ground cover (a mid meadow green). */
export const GROUND_GLOW = 0x2c4a16;
/** Ground cover draws out to this share of CLASS_RANGE.ground per quality step (56 m at high, 48 m at medium, 36 m at low; 64/56/40 is the target once the integrated-GPU check passes, a one-line change to CLASS_RANGE.ground). */
export const GROUND_RANGE_SCALE: Readonly<Record<'low' | 'medium' | 'high', number>> = { low: 9 / 14, medium: 6 / 7, high: 1 };
/** Share of each class kept per quality step. */
export const DENSITY: Readonly<Record<'low' | 'medium' | 'high', Readonly<Record<PlacementClass, number>>>> = {
  low: { tree: 0.7, bush: 0.5, rock: 0.7, wood: 0.4, ground: 0.35, prop: 0.7, hedge: 1 },
  medium: { tree: 1, bush: 0.85, rock: 1, wood: 0.8, ground: 0.7, prop: 1, hedge: 1 },
  high: { tree: 1, bush: 1, rock: 1, wood: 1, ground: 1, prop: 1, hedge: 1 },
};

/** Side of a draw cell (m): batches are split by cell so distance hiding works while the player stands inside a tile. */
const CELL = 64;
/**
 * Trees are seen to 700 m, so a 64 m cell split a tile's trees into hundreds of batches (45% of the visible batches along the Dead Road).
 * Their cells are 256 m. A cell is shown whole while any part of its bounding sphere is within range, so a cell that straddles the
 * range edge shows a few trees up to about one cell past 700 m (conservative: nothing inside the range is ever hidden).
 */
export const CELL_SIZE: Readonly<Record<PlacementClass, number>> = { tree: 256, bush: CELL, rock: CELL, wood: CELL, ground: CELL, prop: CELL, hedge: CELL };
/** A build of more instances than this yields to the browser between ids. */
const BIG_TILE = 20000;

export function classOf(id: string): PlacementClass {
  if (/^(oak|birch|elm|autumn|ash-tree|poplar|apple|tree_dead|willow)/.test(id)) return 'tree';
  if (/^(bush|fern|reeds)/.test(id)) return 'bush';
  if (/^(boulder|rock|cairn|basalt|ember-rock|slag)/.test(id)) return 'rock';
  if (/^(stump|log|mushroom|charred)/.test(id)) return 'wood';
  if (/^(grass|flower)/.test(id)) return 'ground';
  if (/^(hedge|picket|wattle|stonewall|fence_stone|scorched-fence)/.test(id)) return 'hedge';
  return 'prop';
}

/** Deterministic 0..1 from a row index, so the order in which density thins instances never changes. */
export function priority(i: number): number {
  let h = Math.imul(i + 1, 2654435761) >>> 0;
  h ^= h >>> 15;
  h = Math.imul(h, 2246822519) >>> 0;
  h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
}

export interface FieldStats {
  rows: number;
  /** Rows that resolved to a scripted placeholder (no model yet). */
  placeholders: number;
  batches: number;
  triangles: number;
}

interface Entry {
  cls: PlacementClass;
  ref: ModelRef;
  rows: Array<{ row: PlacementRow; order: number }>;
}

const tintKey = (t?: Tint): string => (t ? `${t.hue ?? 0}/${t.sat ?? 1}/${t.mul ?? 0xffffff}/${t.glow ?? ''}` : '');

function tintedMaterial(base: THREE.Material, tint: Tint, lift = 1): THREE.Material {
  const m = base.clone() as THREE.MeshStandardMaterial;
  if (lift !== 1 && m.color) {
    m.color.multiplyScalar(lift);
    // A flat glow independent of the light, so a clump keeps a meadow green in shade and at a distance instead of going black.
    if (m.emissive) m.emissive.setHex(tint.glow ?? GROUND_GLOW);
  }
  if (tint.mul !== undefined && m.color) m.color.multiply(new THREE.Color(tint.mul));
  if (tint.hue || (tint.sat !== undefined && tint.sat !== 1)) {
    const k = hueMatrix(tint.hue ?? 0, tint.sat ?? 1);
    m.customProgramCacheKey = () => `env-hue-${tint.hue ?? 0}-${tint.sat ?? 1}`;
    m.onBeforeCompile = (shader) => {
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <map_fragment>',
        `#include <map_fragment>\n diffuseColor.rgb = mat3(${k[0]}, ${k[3]}, ${k[6]}, ${k[1]}, ${k[4]}, ${k[7]}, ${k[2]}, ${k[5]}, ${k[8]}) * diffuseColor.rgb;`,
      );
    };
  }
  return m;
}

export class PlacementField {
  readonly object = new THREE.Group();
  readonly stats: FieldStats = { rows: 0, placeholders: 0, batches: 0, triangles: 0 };
  private readonly byClass = new Map<PlacementClass, { group: THREE.Group; batches: Array<{ model: InstancedModel; total: number; sphere: THREE.Sphere }> }>();
  /** Clones and generated geometry this field owns (template parts and the shared placeholder material belong to others). */
  private readonly owned: Array<{ dispose(): void }> = [];
  private disposed = false;

  constructor(
    private readonly lib: ModelLibrary,
    private readonly heightAt: (x: number, z: number) => number,
  ) {
    this.object.name = 'env.placements';
  }

  async build(source: readonly PlacementRow[]): Promise<void> {
    // A patch row stands for 6 to 14 ground tufts; the field draws the tufts (they thin with the ground quality step like any ground row).
    const rows = expandPatches(source);
    const entries = new Map<string, Entry>();
    rows.forEach((row, i) => {
      const ref = resolveModel(row.id);
      const key = `${row.id}`;
      const e = entries.get(key) ?? { cls: classOf(row.id), ref, rows: [] };
      entries.set(key, e);
      e.rows.push({ row, order: priority(i) });
    });
    this.stats.rows = rows.length;
    const mats = new Map<string, THREE.Material>();
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    for (const [id, e] of entries) {
      const resolved = await this.partsFor(id, e.ref);
      if (this.disposed) {
        if (resolved?.placeholder) for (const p of resolved.parts) p.geometry.dispose();
        return;
      }
      if (resolved?.placeholder) for (const p of resolved.parts) this.owned.push(p.geometry);
      if (!resolved) continue;
      if (resolved.placeholder) this.stats.placeholders += e.rows.length;
      let parts = resolved.parts;
      const real = e.ref.source !== 'placeholder' && !resolved.placeholder;
      const lift = real && e.cls === 'ground' ? GROUND_LIFT : 1;
      const tint = real ? (e.ref.source !== 'placeholder' ? e.ref.tint : undefined) ?? (lift !== 1 ? {} : undefined) : undefined;
      if (tint) {
        parts = parts.map((p) => {
          const k = `${p.material.uuid}|${tintKey(tint)}|${lift}`;
          let mat = mats.get(k);
          if (!mat) {
            mats.set(k, (mat = tintedMaterial(p.material, tint, lift)));
            this.owned.push(mat);
          }
          return { geometry: p.geometry, material: mat };
        });
      }
      // A variant may stretch its base model in height only (reeds from a grass clump, a squat willow from an elm).
      const sy = real && e.ref.source !== 'placeholder' ? (e.ref.stretchY ?? 1) : 1;
      const girth = e.ref.source !== 'placeholder' ? (e.ref.girth ?? 1) : 1;
      const sorted = [...e.rows].sort((a, b) => a.order - b.order);
      // One batch per grid cell, so the distance test can hide the far cells of a large tile while the player stands inside it.
      const cells = new Map<string, PlacementRow[]>();
      for (const { row } of sorted) {
        const cell = CELL_SIZE[e.cls];
        const k = `${Math.floor(row.x / cell)},${Math.floor(row.z / cell)}`;
        (cells.get(k) ?? cells.set(k, []).get(k)!).push(row);
      }
      for (const cellRows of cells.values()) {
        const batch = new InstancedModel(parts, cellRows.length);
        for (const mesh of batch.meshes) mesh.castShadow = e.cls === 'tree' || e.cls === 'prop';
        for (const row of cellRows) {
          const s = (row.scale ?? 1) * resolved.scale;
          q.setFromAxisAngle(up, ((row.yaw ?? 0) * Math.PI) / 180);
          m.compose(new THREE.Vector3(row.x, this.heightAt(row.x, row.z), row.z), q, new THREE.Vector3(s * girth, s * sy, s * girth));
          batch.addInstance(m);
        }
        for (const mesh of batch.meshes) mesh.computeBoundingSphere();
        const sphere = new THREE.Sphere();
        new THREE.Box3().setFromObject(batch).getBoundingSphere(sphere);
        const slot = this.slot(e.cls);
        slot.group.add(batch);
        slot.batches.push({ model: batch, total: cellRows.length, sphere });
        this.stats.batches += batch.meshes.length;
        this.stats.triangles += resolved.triangles * cellRows.length;
      }
      // A big tile (the Dead Road's 80k instances each) builds one id at a time with a pause between them, so the game keeps drawing frames.
      if (rows.length > BIG_TILE) await new Promise<void>((r) => setTimeout(r, 0));
    }
    this.setDensity(this.density);
  }

  private slot(cls: PlacementClass) {
    let s = this.byClass.get(cls);
    if (!s) {
      const group = new THREE.Group();
      group.name = `env:${cls}`;
      this.object.add(group);
      s = { group, batches: [] };
      this.byClass.set(cls, s);
    }
    return s;
  }

  private async partsFor(id: string, ref: ModelRef): Promise<{ parts: ModelTemplate['parts']; scale: number; triangles: number; placeholder: boolean } | null> {
    if (ref.source === 'placeholder') {
      const geometry = placeholderGeometry(id, ref.shape);
      const tris = (geometry.index?.count ?? geometry.getAttribute('position').count) / 3;
      return { parts: [{ geometry, material: placeholderMaterial() }], scale: 1, triangles: tris, placeholder: true };
    }
    const t = await this.lib.template(ref.model);
    if (t) {
      let scale = ref.scale;
      if (ref.fitHeight) scale = ref.fitHeight / (t.bounds.max.y - t.bounds.min.y);
      return { parts: t.parts, scale, triangles: t.triangles, placeholder: false };
    }
    // The model did not load (offline, headless): fall back to the placeholder for this id.
    return this.partsFor(id, { source: 'placeholder', shape: classShape(id) });
  }

  private density: 'low' | 'medium' | 'high' = 'medium';

  /** Keep this share of each class (see DENSITY); the same instances are dropped every time. */
  setDensity(step: 'low' | 'medium' | 'high'): void {
    this.density = step;
    for (const [cls, slot] of this.byClass) {
      const keep = DENSITY[step][cls];
      for (const b of slot.batches) {
        const n = Math.ceil(b.total * keep);
        for (const mesh of b.model.meshes) mesh.count = n;
      }
    }
  }

  /** Hide each batch (a grid cell of one model) that is beyond its class range from the player. */
  update(px: number, pz: number): void {
    for (const [cls, slot] of this.byClass) {
      for (const b of slot.batches) {
        const d = Math.hypot(px - b.sphere.center.x, pz - b.sphere.center.z) - b.sphere.radius;
        b.model.visible = d <= (cls === 'ground' ? CLASS_RANGE.ground * GROUND_RANGE_SCALE[this.density] : CLASS_RANGE[cls]);
      }
    }
  }

  classes(): PlacementClass[] {
    return [...this.byClass.keys()];
  }

  /** Instances currently drawn per class (batches in range only when `visibleOnly`). */
  drawn(visibleOnly = false): Record<string, number> {
    const out: Record<string, number> = {};
    for (const [cls, slot] of this.byClass)
      out[cls] = slot.batches.reduce((n, b) => n + (visibleOnly && !b.model.visible ? 0 : (b.model.meshes[0]?.count ?? 0)), 0);
    return out;
  }

  /** Batches of a class currently visible and in total (tests, debug). */
  batchCounts(cls: PlacementClass): { visible: number; total: number } {
    const b = this.byClass.get(cls)?.batches ?? [];
    return { visible: b.filter((x) => x.model.visible).length, total: b.length };
  }

  dispose(): void {
    this.disposed = true;
    this.object.removeFromParent();
    for (const slot of this.byClass.values()) for (const b of slot.batches) for (const mesh of b.model.meshes) mesh.dispose();
    for (const o of this.owned.splice(0)) o.dispose();
    this.byClass.clear();
  }
}

function classShape(id: string): 'tree' | 'bush' | 'grass' | 'flower' | 'rock' | 'box' {
  const c = classOf(id);
  return c === 'tree' ? 'tree' : c === 'bush' ? 'bush' : c === 'rock' ? 'rock' : c === 'ground' ? 'grass' : 'box';
}
