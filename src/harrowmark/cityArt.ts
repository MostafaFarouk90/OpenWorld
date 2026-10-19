// The Harrowmark asset swap: which real models stand in for which of the city's greybox structures, planned as instanced
// placements in world space and grouped into spatial chunks so a view only draws what is near. Visual only: colliders, anchors
// and the layout are cityBuild's and the layout's; nothing here adds a structure spec.
import * as THREE from 'three';
import { explicitFit, fitToBox, hashPick, tile, tileLine, type Fit } from '../assets/swap/fit';
import { ModelBatches, type BatchStats } from '../assets/swap/ModelBatches';
import type { ModelLibrary, ModelTemplate } from '../assets/swap/ModelLibrary';
import type { StructureSpec } from '../region/layoutTypes';

/** Edge of a chunk cell in metres. */
export const CHUNK = 96;
/** Chunks show when their nearest edge is closer than ENTER and hide beyond EXIT (a 40 m hysteresis band). */
export const LOD_ENTER = 260;
export const LOD_EXIT = 300;
/** How far a wall or tower visual reaches below its collider base, so a slope never shows daylight under it. */
const SKIRT = 2;
const MODULE_GAP = 0.2;

/** How a covered structure's greybox is inset so models in front of it do not z-fight (sides) and the greybox still shows through. */
export interface Coverage {
  /** Metres taken off each side of the greybox box. */
  inset: number;
  /** Metres taken off the top (0 for a deck that must stay walkable). */
  topInset: number;
  /** A full-footprint slab of this thickness is added on top (the Rooftop Ward's walkable deck). */
  deck?: number;
}

type Recipe =
  | { r: 'wall' }
  | { r: 'tower'; model: string }
  | { r: 'tiles'; models: string[]; pitch: number; perimeter: boolean; maxScale: number; keep?: boolean; chapel?: boolean }
  | { r: 'single'; model: string; maxScale: number }
  | { r: 'facade' }
  | { r: 'stall' }
  | { r: 'crate' }
  | { r: 'fence' };

const HOME = ['hex/building_home_A_red', 'hex/building_home_B_red'];

/** The recipe for a structure, or null when it keeps its greybox (stair steps, the fountain, the portcullis, drill blocker, tall rooftop crates). */
function recipeFor(spec: StructureSpec): Recipe | null {
  const id = spec.id;
  const h = spec.height ?? 0;
  switch (spec.kind) {
    case 'wall':
      return { r: 'wall' };
    case 'tower':
      return { r: 'tower', model: id.startsWith('keep.') ? 'hex/building_tower_A_red' : 'hex/building_tower_base_red' };
    case 'block':
      return id.startsWith('ward.') ? { r: 'facade' } : null;
    case 'stall':
      return { r: 'stall' };
    case 'crate':
      return h > 2.5 ? null : { r: 'crate' };
    case 'yard-fence':
      return { r: 'fence' };
    case 'tavern':
      return { r: 'tiles', models: ['hex/building_tavern_red', 'hex/building_home_B_red'], pitch: 10, perimeter: true, maxScale: 8.5 };
    case 'chapel':
      return { r: 'tiles', models: ['hex/building_home_B_red'], pitch: 10, perimeter: true, maxScale: 8, chapel: true };
    case 'house': {
      if (id === 'keep.hall') return { r: 'tiles', models: ['hex/building_barracks_red'], pitch: 10, perimeter: true, maxScale: 8, keep: true };
      if (id.startsWith('barracks.') || id.startsWith('bastion.')) return { r: 'tiles', models: ['hex/building_barracks_red'], pitch: 10, perimeter: true, maxScale: 8 };
      if (id.startsWith('forge.')) return { r: 'tiles', models: ['hex/building_blacksmith_red', ...HOME], pitch: 8, perimeter: true, maxScale: 8 };
      if (id === 'counting-house') return { r: 'tiles', models: ['hex/building_market_red'], pitch: 12, perimeter: true, maxScale: 9 };
      if (id === 'underways.gatehouse') return { r: 'single', model: 'hex/building_home_A_red', maxScale: 8 };
      return { r: 'tiles', models: HOME, pitch: 7, perimeter: true, maxScale: 8 };
    }
    default:
      return null;
  }
}

/** Greybox coverage of a structure (sync, independent of whether the models loaded). Null when the structure keeps its greybox whole. */
export function coverageOf(spec: StructureSpec): Coverage | null {
  const r = recipeFor(spec);
  if (!r) return null;
  if (r.r === 'facade') return { inset: 0.5, topInset: 0.3, deck: 0.3 };
  if (r.r === 'fence' || r.r === 'crate' || r.r === 'stall') return null;
  return { inset: Math.min(0.4, Math.min(spec.footprint[0], spec.footprint[1]) / 4), topInset: 0.3 };
}

/** Every model id the recipes of `structures` can use (what to preload). */
export function modelIdsFor(structures: readonly StructureSpec[]): string[] {
  const ids = new Set<string>();
  for (const s of structures) {
    const r = recipeFor(s);
    if (!r) continue;
    switch (r.r) {
      case 'wall':
        ids.add('hex/wall_straight');
        break;
      case 'tower':
        ids.add(r.model);
        break;
      case 'tiles':
        r.models.forEach((m) => ids.add(m));
        if (r.keep) ids.add('hex/building_castle_red');
        if (r.chapel) ids.add('hex/building_church_red');
        break;
      case 'single':
        ids.add(r.model);
        break;
      case 'facade':
        ['dun/wall', 'dun/wall_window_open', 'dun/wall_arched'].forEach((m) => ids.add(m));
        break;
      case 'stall':
        ['dun/table_long_decorated_A', 'dun/banner_thin_red'].forEach((m) => ids.add(m));
        break;
      case 'crate':
        ['dun/box_large', 'hex/crate_long_A'].forEach((m) => ids.add(m));
        break;
      case 'fence':
        ids.add('hex/fence_wood_straight');
        break;
    }
  }
  return [...ids].sort();
}

export interface PlannedPiece {
  model: string;
  matrix: THREE.Matrix4;
  structure: string;
}

const _m = new THREE.Matrix4();
const _r = new THREE.Matrix4();
const _s = new THREE.Matrix4();

/** world · translate(local) · rotY(rot) · translate(fit.offset) · scale(fit) */
function pieceMatrix(world: THREE.Matrix4, fit: Fit, lx: number, ly: number, lz: number, rot = 0): THREE.Matrix4 {
  _m.makeTranslation(lx, ly, lz);
  _r.makeRotationY(rot);
  const out = world.clone().multiply(_m).multiply(_r);
  _m.makeTranslation(fit.offset.x, fit.offset.y, fit.offset.z);
  _s.makeScale(fit.sx, fit.sy, fit.sz);
  return out.multiply(_m).multiply(_s);
}

/** Plans the placements of one structure. `tpl` returns a loaded template or null (that piece is skipped). */
export function planStructure(
  spec: StructureSpec,
  y: number,
  tpl: (id: string) => ModelTemplate | null,
): PlannedPiece[] {
  const recipe = recipeFor(spec);
  if (!recipe) return [];
  const out: PlannedPiece[] = [];
  const world = new THREE.Matrix4().makeTranslation(spec.x, y, spec.z).multiply(new THREE.Matrix4().makeRotationY((spec.yawDeg * Math.PI) / 180));
  const [w, d] = spec.footprint;
  const h = spec.height ?? 6;
  const add = (model: string, fit: Fit, lx: number, ly: number, lz: number, rot = 0): void => {
    out.push({ model, matrix: pieceMatrix(world, fit, lx, ly, lz, rot), structure: spec.id });
  };
  const size = (t: ModelTemplate) => ({ x: t.bounds.max.x - t.bounds.min.x, y: t.bounds.max.y - t.bounds.min.y, z: t.bounds.max.z - t.bounds.min.z });

  switch (recipe.r) {
    case 'wall': {
      const t = tpl('hex/wall_straight');
      if (!t) break;
      const raw = size(t);
      for (const p of tileLine(w, 11)) {
        add('hex/wall_straight', explicitFit(t.bounds, p.len / raw.x, (h + SKIRT) / raw.y, d / raw.z), p.c, -SKIRT, 0);
      }
      break;
    }
    case 'tower': {
      const t = tpl(recipe.model);
      if (!t) break;
      const raw = size(t);
      add(recipe.model, explicitFit(t.bounds, w / raw.x, (h + SKIRT) / raw.y, d / raw.z), 0, -SKIRT, 0);
      break;
    }
    case 'single': {
      const t = tpl(recipe.model);
      if (!t) break;
      add(recipe.model, fitToBox(t.bounds, { width: w, depth: d }, { maxScale: recipe.maxScale }), 0, 0, 0);
      break;
    }
    case 'tiles': {
      const cells = tile(w, d, recipe.pitch, recipe.perimeter);
      for (const cell of cells) {
        const model = recipe.models[hashPick(`${spec.id}:${cell.cx.toFixed(0)}:${cell.cz.toFixed(0)}`, recipe.models.length)];
        const t = tpl(model);
        if (!t) continue;
        const fit = fitToBox(
          t.bounds,
          { width: cell.w - MODULE_GAP, depth: cell.d - MODULE_GAP, height: spec.height },
          { maxScale: recipe.maxScale, maxStretch: 0.25, maxHeightStretch: 0.35 },
        );
        add(model, fit, cell.cx, 0, cell.cz);
      }
      if (recipe.keep) {
        const t = tpl('hex/building_castle_red');
        if (t) {
          const raw = size(t);
          add('hex/building_castle_red', explicitFit(t.bounds, 21 / raw.x, 36 / raw.y, 24 / raw.z), 0, 0, 0);
        }
      }
      if (recipe.chapel) {
        const t = tpl('hex/building_church_red');
        if (t) add('hex/building_church_red', fitToBox(t.bounds, { width: 17, depth: 19 }, { maxScale: 16.5 }), 0, 0, 0);
      }
      break;
    }
    case 'facade': {
      const inset = 0.45;
      const thick = 0.9;
      const top = h - 0.3;
      const ids = ['dun/wall', 'dun/wall_window_open', 'dun/wall_arched'];
      const sides: Array<{ len: number; at: (c: number) => [number, number]; rot: number }> = [
        { len: w, at: (c) => [c, -d / 2 + inset], rot: 0 },
        { len: w, at: (c) => [c, d / 2 - inset], rot: Math.PI },
        { len: d, at: (c) => [-w / 2 + inset, c], rot: Math.PI / 2 },
        { len: d, at: (c) => [w / 2 - inset, c], rot: -Math.PI / 2 },
      ];
      for (const [si, side] of sides.entries()) {
        for (const [i, p] of tileLine(side.len, 6.4).entries()) {
          const model = ids[hashPick(`${spec.id}:${si}:${i}`, 3)];
          const t = tpl(model);
          if (!t) continue;
          const [lx, lz] = side.at(p.c);
          add(model, explicitFit(t.bounds, p.len / 4, top / 4, thick), lx, 0, lz, side.rot);
        }
      }
      break;
    }
    case 'stall': {
      const t = tpl('dun/table_long_decorated_A');
      if (!t) break;
      // The table runs along z; stalls are wider along x.
      add('dun/table_long_decorated_A', explicitFit(t.bounds, 1, 1, 1), 0, 0, d * 0.2, w >= d ? Math.PI / 2 : 0);
      const b = tpl('dun/banner_thin_red');
      if (b) for (const sx of [-1, 1]) add('dun/banner_thin_red', explicitFit(b.bounds, 0.6, 0.6, 0.6), sx * (w / 2 - 0.3), 0.8, -d * 0.4);
      break;
    }
    case 'crate': {
      const long = Math.max(w, d) >= 3;
      const model = long ? 'hex/crate_long_A' : 'dun/box_large';
      const t = tpl(model);
      if (!t) break;
      const rot = long && d > w ? Math.PI / 2 : 0;
      const fit = fitToBox(t.bounds, { width: long && rot ? d : w, depth: long && rot ? w : d, height: spec.height }, { maxStretch: 0.5, maxHeightStretch: 0.6 });
      add(model, fit, 0, 0, 0, rot);
      break;
    }
    case 'fence': {
      const t = tpl('hex/fence_wood_straight');
      if (!t) break;
      const raw = size(t);
      const s = 2;
      const run = (len: number, at: (c: number) => [number, number], rot: number): void => {
        for (const p of tileLine(len, raw.z * s)) {
          const [lx, lz] = at(p.c);
          add('hex/fence_wood_straight', explicitFit(t.bounds, s, s, p.len / raw.z), lx, 0, lz, rot);
        }
      };
      run(w, (c) => [c, -d / 2], Math.PI / 2);
      run(w, (c) => [c, d / 2], Math.PI / 2);
      run(d, (c) => [-w / 2, c], 0);
      run(d, (c) => [w / 2, c], 0);
      break;
    }
  }
  return out;
}

/** Chunk key of a world x, z. */
export const chunkKey = (x: number, z: number): string => `${Math.floor(x / CHUNK)},${Math.floor(z / CHUNK)}`;

/** Shows each chunk's batches while the camera is near (enter/exit radii form a hysteresis band). */
export class ModelChunks {
  private readonly shown = new Map<string, boolean>();

  constructor(
    readonly groups: ReadonlyMap<string, THREE.Group>,
    private readonly enter = LOD_ENTER,
    private readonly exit = LOD_EXIT,
  ) {
    for (const g of groups.values()) g.visible = false;
  }

  /** `scale` shrinks both radii for lower quality steps. Returns how many chunks are visible. */
  update(camX: number, camY: number, camZ: number, scale = 1): number {
    let n = 0;
    for (const [key, g] of this.groups) {
      const s = g.userData.sphere as THREE.Sphere;
      const dist = Math.hypot(camX - s.center.x, camY - s.center.y, camZ - s.center.z) - s.radius;
      const on = this.shown.get(key) ? dist < this.exit * scale : dist < this.enter * scale;
      this.shown.set(key, on);
      g.visible = on;
      if (on) n++;
    }
    return n;
  }

  visibleKeys(): string[] {
    return [...this.groups].filter(([, g]) => g.visible).map(([k]) => k);
  }
}

export interface CityModels {
  root: THREE.Group;
  chunks: ModelChunks;
  stats: BatchStats;
  /** Triangles of the chunks that are visible now. */
  visibleTriangles(): number;
  dispose(): void;
}

/**
 * Loads every model the recipes need and plans the placements. Resolves to null when the library has no source or no model of
 * a covered recipe loaded (the greybox stays); a model that fails drops only its own pieces.
 */
export async function buildCityModels(
  lib: ModelLibrary,
  structures: readonly StructureSpec[],
  heightAt: (x: number, z: number) => number,
): Promise<CityModels | null> {
  const templates = await lib.preload(modelIdsFor(structures));
  if (templates.length === 0) return null;
  const batches = new ModelBatches();
  const byId = new Map(templates.map((t) => [t.id, t]));
  for (const spec of structures) {
    const y = heightAt(spec.x, spec.z);
    for (const piece of planStructure(spec, y, (id) => byId.get(id) ?? null)) {
      const t = byId.get(piece.model)!;
      const e = piece.matrix.elements;
      batches.add(chunkKey(e[12], e[14]), t, piece.matrix);
    }
  }
  const { groups, stats } = batches.build();
  if (groups.size === 0) return null;
  const root = new THREE.Group();
  root.name = 'harrowmark-models';
  for (const g of groups.values()) root.add(g);
  const chunks = new ModelChunks(groups);
  const trianglesOf = new Map<string, number>();
  for (const [key, g] of groups) {
    let tris = 0;
    g.traverse((o) => {
      const m = o as THREE.InstancedMesh;
      if (!m.isInstancedMesh) return;
      const geo = m.geometry;
      tris += ((geo.index?.count ?? geo.getAttribute('position').count) / 3) * m.count;
    });
    trianglesOf.set(key, tris);
  }
  return {
    root,
    chunks,
    stats,
    visibleTriangles: () => chunks.visibleKeys().reduce((n, k) => n + (trianglesOf.get(k) ?? 0), 0),
    dispose() {
      root.removeFromParent();
      root.traverse((o) => (o as THREE.InstancedMesh).isInstancedMesh && (o as THREE.InstancedMesh).dispose());
    },
  };
}
