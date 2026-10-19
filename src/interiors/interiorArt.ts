// The asset swap for interiors: Dungeon Remastered floors, walls and pillars, Furniture and Dungeon props, instanced into one
// group inside the interior's root (so it shows only while the player is inside). Colliders, nav and anchors are the layout's;
// this only hides the merged greybox of the kinds it covers and draws models over the same boxes.
import * as THREE from 'three';
import { explicitFit, hashPick, tileLine, type Fit } from '../assets/swap/fit';
import { ModelBatches } from '../assets/swap/ModelBatches';
import type { ModelLibrary, ModelTemplate } from '../assets/swap/ModelLibrary';
import type { BuiltInterior } from './build';
import type { SolidBox } from './layout';

const FLOOR_MODEL: Record<string, string> = {
  'tilted-anvil': 'dun/floor_wood_large',
  'counting-house': 'dun/floor_wood_large',
  archive: 'dun/floor_wood_large',
};
const DEFAULT_FLOOR = 'dun/floor_tile_large';
/** Wall course height at raw scale; a wall taller than 6.5 m stacks two courses. */
const COURSE = 4;
const FLOOR_LIFT = 0.02;
const WALL_VARIANTS_UNDERWAYS = ['dun/wall', 'dun/wall', 'dun/wall_broken', 'dun/wall_cracked'];

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

export function interiorModelIds(): string[] {
  const ids = new Set<string>([DEFAULT_FLOOR, ...Object.values(FLOOR_MODEL), 'dun/wall', 'dun/wall_window_open', 'dun/pillar', ...WALL_VARIANTS_UNDERWAYS]);
  for (const [m] of PROP_MODELS) ids.add(m);
  return [...ids].sort();
}

const size = (b: SolidBox) => ({ x: b.max.x - b.min.x, y: b.max.y - b.min.y, z: b.max.z - b.min.z });
const centre = (b: SolidBox) => ({ x: (b.min.x + b.max.x) / 2, z: (b.min.z + b.max.z) / 2 });

export interface InteriorPiece {
  model: string;
  matrix: THREE.Matrix4;
  kind: 'floor' | 'wall' | 'pillar' | 'prop';
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

  const floor = tpl(FLOOR_MODEL[interiorId] ?? DEFAULT_FLOOR);
  const wall = tpl('dun/wall');
  const pillar = tpl('dun/pillar');
  const underways = interiorId === 'underways';

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
          pieces.push({ model: floor.id, kind: 'floor', matrix: matrixOf(fit, b.min.x + w * (i + 0.5), b.max.y + FLOOR_LIFT - floor.bounds.max.y, b.min.z + d * (j + 0.5)) });
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
          const windowed = !underways && k === 0 && courses === 1 && len >= 8 && p.len >= 3 && hashPick(`${interiorId}:${b.min.x.toFixed(1)}:${b.min.z.toFixed(1)}:${i}`, 4) === 0;
          const id = underways ? WALL_VARIANTS_UNDERWAYS[hashPick(`${b.min.x.toFixed(1)}:${b.min.z.toFixed(1)}:${i}:${k}`, WALL_VARIANTS_UNDERWAYS.length)] : windowed ? 'dun/wall_window_open' : 'dun/wall';
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

/**
 * Loads the models and dresses `built`. Never rejects: with no loader or a failed load the greybox stays. Resolves to the number
 * of instanced meshes added (0 when nothing was dressed).
 */
export async function dressInterior(lib: ModelLibrary, built: BuiltInterior): Promise<number> {
  const templates = await lib.preload(interiorModelIds());
  if (templates.length === 0 || built.disposed) return 0;
  const byId = new Map(templates.map((t) => [t.id, t]));
  const { pieces, dressedProps, covers } = planInterior(built.layout.def.id, built.layout.boxes, (id) => byId.get(id) ?? null);
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
  return stats.batches;
}
