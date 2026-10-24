// The asset swap for interiors: Dungeon Remastered floors, walls and pillars, Furniture and Dungeon props, instanced into one
// group inside the interior's root (so it shows only while the player is inside). Colliders, nav and anchors are the layout's;
// this only hides the merged greybox of the kinds it covers and draws models over the same boxes.
import * as THREE from 'three';
import { explicitFit, hashPick, tileLine, type Fit } from '../assets/swap/fit';
import { ModelBatches } from '../assets/swap/ModelBatches';
import type { ModelLibrary, ModelTemplate } from '../assets/swap/ModelLibrary';
import type { BuiltInterior } from './build';
import type { SolidBox } from './layout';
import { planProp, SKIRT_HEIGHT, MIN_COVERAGE } from './propFit';

const FLOOR_MODEL: Record<string, string> = {
  'tilted-anvil': 'dun/floor_wood_large',
  'counting-house': 'dun/floor_wood_large',
  archive: 'dun/floor_wood_large',
};
const DEFAULT_FLOOR = 'dun/floor_tile_large';
/** The Deepgate mines (`mine-*`): dirt floors, weathered walls, mounted torches. */
const MINE_FLOOR = 'dun/floor_dirt_large';
const TORCH_MODEL = 'dun/torch_mounted';
export const isMineInterior = (interiorId: string) => interiorId.startsWith('mine-');
/** Wall course height at raw scale; a wall taller than 6.5 m stacks two courses. */
const COURSE = 4;
const FLOOR_LIFT = 0.02;
const WALL_VARIANTS_UNDERWAYS = ['dun/wall', 'dun/wall', 'dun/wall_broken', 'dun/wall_cracked'];
/**
 * Mine walls are single boxes with nothing behind them, so `wall_broken` (it has a see-through hole) is never used: the kept shaft
 * head and the Bellows are sound masonry (cracks only), the old, lower and deep workings are cracked more often.
 */
const WALL_VARIANTS_MINE_KEPT = ['dun/wall', 'dun/wall', 'dun/wall', 'dun/wall_cracked'];
const WALL_VARIANTS_MINE_WORN = ['dun/wall', 'dun/wall', 'dun/wall_cracked', 'dun/wall_cracked'];
const wallVariants = (interiorId: string): readonly string[] | null =>
  interiorId === 'underways' ? WALL_VARIANTS_UNDERWAYS : !isMineInterior(interiorId) ? null : /deepgate-shaft|weeping-bellows/.test(interiorId) ? WALL_VARIANTS_MINE_KEPT : WALL_VARIANTS_MINE_WORN;

/** [model, prefix of the prop ids it dresses] (a prop whose id matches no prefix keeps its greybox box). */
const PROP_MODELS: Array<[string, string[]]> = [
  ['dun/table_medium', ['table.']],
  ['dun/table_long', ['counter.']],
  ['fur/table_medium_long', ['desk.']],
  ['dun/shelves', ['shelf.']],
  ['fur/cabinet_medium', ['cabinet.']],
  ['fur/bed_single_A', ['bed.']],
  ['fur/table_small', ['lectern.']],
];

/**
 * Mine props (Oldsmoke, `mine-*` only): candidate models per prop-id pattern, matched on whole dot-separated segments (`pump.crate`
 * is not `pump.body`). `propFit.planProp` tiles the best candidate or leaves the box; nests, pools and lava stay boxes.
 */
const MINE_PROP_MODELS: Array<[string[], string[]]> = [
  [['pump.body'], ['dun/barrel_large', 'dun/keg', 'dun/barrel_small']],
  [['pump.crate', 'cart', 'crate'], ['dun/crates_stacked', 'dun/box_large']],
  [['rack'], ['dun/shelves']],
  [['rubble', 'collapse'], ['dun/rubble_large', 'dun/rubble_half']],
  [['chainpost'], ['dun/pillar', 'dun/column']],
  [['pipes'], ['dun/column', 'dun/pillar']],
];
const idMatches = (propId: string, pattern: string) => {
  const a = propId.split('.');
  const b = pattern.split('.');
  return b.every((seg, i) => a[i] === seg);
};
const MINE_PROP_IDS = [...new Set(MINE_PROP_MODELS.flatMap(([, ms]) => ms))];

export function interiorModelIds(): string[] {
  const ids = new Set<string>([DEFAULT_FLOOR, MINE_FLOOR, TORCH_MODEL, ...MINE_PROP_IDS, ...Object.values(FLOOR_MODEL), 'dun/wall', 'dun/wall_window_open', 'dun/pillar', ...WALL_VARIANTS_UNDERWAYS]);
  for (const [m] of PROP_MODELS) ids.add(m);
  return [...ids].sort();
}

const size = (b: SolidBox) => ({ x: b.max.x - b.min.x, y: b.max.y - b.min.y, z: b.max.z - b.min.z });
const centre = (b: SolidBox) => ({ x: (b.min.x + b.max.x) / 2, z: (b.min.z + b.max.z) / 2 });

export interface InteriorPiece {
  model: string;
  matrix: THREE.Matrix4;
  kind: 'floor' | 'wall' | 'pillar' | 'prop' | 'skirt' | 'torch';
  /** The prop box a 'prop' or 'skirt' piece dresses. */
  propId?: string;
}

function matrixOf(fit: Fit, x: number, y: number, z: number, rot = 0): THREE.Matrix4 {
  return new THREE.Matrix4()
    .makeTranslation(x, y, z)
    .multiply(new THREE.Matrix4().makeRotationY(rot))
    .multiply(new THREE.Matrix4().makeTranslation(fit.offset.x, fit.offset.y, fit.offset.z))
    .multiply(new THREE.Matrix4().makeScale(fit.sx, fit.sy, fit.sz));
}

/** Plans one interior's pieces. `tpl` returns a loaded template or null; a kind whose model is missing yields no pieces of that kind. */
export function planInterior(interiorId: string, boxes: readonly SolidBox[], tpl: (id: string) => ModelTemplate | null): { pieces: InteriorPiece[]; dressedProps: Set<string>; covers: Set<'floor' | 'wall' | 'pillar'> } {
  const pieces: InteriorPiece[] = [];
  const dressedProps = new Set<string>();
  const covers = new Set<'floor' | 'wall' | 'pillar'>();
  const raw = (t: ModelTemplate) => ({ x: t.bounds.max.x - t.bounds.min.x, y: t.bounds.max.y - t.bounds.min.y, z: t.bounds.max.z - t.bounds.min.z });

  const floor = tpl(FLOOR_MODEL[interiorId] ?? (isMineInterior(interiorId) ? MINE_FLOOR : DEFAULT_FLOOR)) ?? tpl(DEFAULT_FLOOR);
  const wall = tpl('dun/wall');
  const pillar = tpl('dun/pillar');
  const variants = wallVariants(interiorId);

  for (const b of boxes) {
    const s = size(b);
    const c = centre(b);
    if (b.kind === 'floor' && floor) {
      covers.add('floor');
      const r = raw(floor);
      const cols = Math.max(1, Math.round(s.x / r.x));
      const rows = Math.max(1, Math.round(s.z / r.z));
      const w = s.x / cols;
      const d = s.z / rows;
      for (let i = 0; i < cols; i++) {
        for (let j = 0; j < rows; j++) {
          // Tile top lies a hair above the slab top; the model's own top is at its bounds' max y.
          const fit = explicitFit(floor.bounds, w / r.x, 1, d / r.z, 'keep');
          // Dirt is lumpy (y -0.1 to 0.11 about a level surface): its y = 0 plane sits on the slab. Tile and wood sit by their top.
          const y = floor.id === MINE_FLOOR ? b.max.y + FLOOR_LIFT : b.max.y + FLOOR_LIFT - floor.bounds.max.y;
          pieces.push({ model: floor.id, kind: 'floor', matrix: matrixOf(fit, b.min.x + w * (i + 0.5), y, b.min.z + d * (j + 0.5)) });
        }
      }
    } else if (b.kind === 'wall' && wall) {
      covers.add('wall');
      const alongX = s.x >= s.z;
      const len = alongX ? s.x : s.z;
      const thick = alongX ? s.z : s.x;
      const courses = s.y > 6.5 ? 2 : 1;
      const sy = s.y / courses / COURSE;
      for (const [i, p] of tileLine(len, 4).entries()) {
        for (let k = 0; k < courses; k++) {
          const windowed = !variants && k === 0 && courses === 1 && len >= 8 && p.len >= 3 && hashPick(`${interiorId}:${b.min.x.toFixed(1)}:${b.min.z.toFixed(1)}:${i}`, 4) === 0;
          const id = variants ? variants[hashPick(`${b.min.x.toFixed(1)}:${b.min.z.toFixed(1)}:${i}:${k}`, variants.length)] : windowed ? 'dun/wall_window_open' : 'dun/wall';
          const t = tpl(id) ?? wall;
          const rt = raw(t);
          const fit = explicitFit(t.bounds, p.len / rt.x, sy, thick / rt.z);
          const x = alongX ? c.x + p.c : c.x;
          const z = alongX ? c.z : c.z + p.c;
          pieces.push({ model: t.id, kind: 'wall', matrix: matrixOf(fit, x, b.min.y + k * s.y / courses, z, alongX ? 0 : Math.PI / 2) });
        }
      }
    } else if (b.kind === 'pillar' && pillar) {
      covers.add('pillar');
      const r = raw(pillar);
      pieces.push({ model: pillar.id, kind: 'pillar', matrix: matrixOf(explicitFit(pillar.bounds, s.x / r.x, s.y / r.y, s.z / r.z), c.x, b.min.y, c.z) });
    } else if (b.kind === 'prop' && b.propId && isMineInterior(interiorId)) {
      const row = MINE_PROP_MODELS.find(([patterns]) => patterns.some((p) => idMatches(b.propId!, p)));
      const models = row ? row[1].map((id) => tpl(id)).filter((t): t is ModelTemplate => !!t) : [];
      const plan = models.length > 0 ? planProp(b, models) : null;
      if (!plan) continue;
      for (const pl of plan.placements) {
        const fit = explicitFit(pl.template.bounds, pl.sx, pl.sy, pl.sz);
        pieces.push({ model: pl.template.id, kind: 'prop', propId: b.propId, matrix: matrixOf(fit, pl.x, b.min.y, pl.z, pl.turn ? Math.PI / 2 : 0) });
      }
      // Where the models leave much of the collider footprint bare, a low stone skirt (a flat slab stretched to a plinth) keeps the base visible.
      const skirt = plan.coverage < MIN_COVERAGE ? tpl(DEFAULT_FLOOR) : null;
      if (plan.coverage < MIN_COVERAGE && skirt) {
        const r = raw(skirt);
        const fit = explicitFit(skirt.bounds, s.x / r.x, (s.y * SKIRT_HEIGHT) / r.y, s.z / r.z);
        pieces.push({ model: skirt.id, kind: 'skirt', propId: b.propId, matrix: matrixOf(fit, c.x, b.min.y, c.z) });
      }
      if (plan.coverage >= MIN_COVERAGE || skirt) dressedProps.add(b.propId);
    } else if (b.kind === 'prop' && b.propId) {
      const entry = PROP_MODELS.find(([, prefixes]) => prefixes.some((p) => b.propId!.startsWith(p)));
      const t = entry ? tpl(entry[0]) : null;
      if (!t) continue;
      const r = raw(t);
      // Turn a quarter when the model's long axis lies across the box's.
      const turn = s.x >= s.z !== r.x >= r.z;
      const fit = explicitFit(t.bounds, (turn ? s.z : s.x) / r.x, s.y / r.y, (turn ? s.x : s.z) / r.z);
      pieces.push({ model: t.id, kind: 'prop', matrix: matrixOf(fit, c.x, b.min.y, c.z, turn ? Math.PI / 2 : 0) });
      dressedProps.add(b.propId);
    }
  }
  return { pieces, dressedProps, covers };
}

/** Flame height above a mounted torch's origin, and how far it stands out from the wall (raw model units). */
const TORCH_FLAME = { y: 0.45, out: 0.35 };

/**
 * Mounted torches for a mine: one `dun/torch_mounted` per torch head, its back on the nearest wall box and its bracket turned into
 * the room. Returns each torch's index with the outward unit normal so the emissive head can move to the flame. Other interiors: none.
 */
export function planTorches(interiorId: string, boxes: readonly SolidBox[], torches: readonly { x: number; y: number; z: number }[], tpl: (id: string) => ModelTemplate | null): { pieces: InteriorPiece[]; normals: Array<{ index: number; nx: number; nz: number; d: number }> } {
  const t = isMineInterior(interiorId) ? tpl(TORCH_MODEL) : null;
  if (!t) return { pieces: [], normals: [] };
  const walls = boxes.filter((b) => b.kind === 'wall');
  const pieces: InteriorPiece[] = [];
  const normals: Array<{ index: number; nx: number; nz: number; d: number }> = [];
  for (const [index, p] of torches.entries()) {
    let best: { d: number; nx: number; nz: number } | null = null;
    for (const w of walls) {
      if (p.y < w.min.y - 0.01 || p.y > w.max.y + 0.01) continue;
      const dx = p.x < w.min.x ? w.min.x - p.x : p.x > w.max.x ? p.x - w.max.x : 0;
      const dz = p.z < w.min.z ? w.min.z - p.z : p.z > w.max.z ? p.z - w.max.z : 0;
      const d = Math.hypot(dx, dz);
      if (best && d >= best.d) continue;
      // Normal points from the wall toward the torch along the axis it is nearest on.
      if (dx >= dz) best = { d, nx: p.x < w.min.x ? -1 : 1, nz: 0 };
      else best = { d, nx: 0, nz: p.z < w.min.z ? -1 : 1 };
    }
    if (!best || best.d > 0.6) continue;
    // The model's back is its z = 0 plane and it reaches out along +z: no re-centring, so the back sits on the wall.
    const fit: Fit = { sx: 1, sy: 1, sz: 1, offset: { x: 0, y: 0, z: 0 }, clamped: false };
    const x = p.x - best.nx * best.d;
    const z = p.z - best.nz * best.d;
    pieces.push({ model: t.id, kind: 'torch', matrix: matrixOf(fit, x, p.y - TORCH_FLAME.y, z, Math.atan2(best.nx, best.nz)) });
    normals.push({ index, nx: best.nx, nz: best.nz, d: best.d });
  }
  return { pieces, normals };
}

/**
 * Loads the models and dresses `built`. Never rejects: with no loader or a failed load the greybox stays. Resolves to the number
 * of instanced meshes added (0 when nothing was dressed).
 */
export async function dressInterior(lib: ModelLibrary, built: BuiltInterior): Promise<number> {
  const templates = await lib.preload(interiorModelIds());
  if (templates.length === 0 || built.disposed) return 0;
  const byId = new Map(templates.map((t) => [t.id, t]));
  const { pieces, dressedProps, covers } = planInterior(built.layout.def.id, built.layout.boxes, (id) => byId.get(id) ?? null);
  const torch = planTorches(built.layout.def.id, built.layout.boxes, built.layout.torches, (id) => byId.get(id) ?? null);
  pieces.push(...torch.pieces);
  if (pieces.length === 0) return 0;
  const batches = new ModelBatches();
  for (const p of pieces) batches.add(built.layout.def.id, byId.get(p.model)!, p.matrix);
  const { groups, stats } = batches.build();
  for (const g of groups.values()) {
    g.name = `${built.root.name}-art`;
    built.root.add(g);
  }
  for (const kind of covers) built.setKindVisible(kind, false);
  if (dressedProps.size > 0) built.hidePropBoxes(dressedProps);
  // The emissive head stays at full size (it is the torch's only light, mines are dark) and moves to the tip of the bracket that holds it.
  for (const n of torch.normals) {
    const head = built.root.getObjectByName(`${built.root.name}-torch-${n.index}`);
    if (!head) continue;
    // On the bracket tip: the same distance from the wall face whatever the torch's own offset from the wall was.
    head.position.x += n.nx * (TORCH_FLAME.out - n.d);
    head.position.z += n.nz * (TORCH_FLAME.out - n.d);
  }
  return stats.batches;
}
