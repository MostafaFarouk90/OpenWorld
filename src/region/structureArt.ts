// Real models for the structure kinds the asset swap covers in Brightwater and the Dead Road. Each builder returns an object in
// the structure holder's frame (footprint centre on the ground, yaw 0); colliders and doors stay the builder's. A kind with no
// builder, or any model that is missing, returns null and the greybox stays.
import * as THREE from 'three';
import { explicitFit, fitToBox, hashPick, tileLine } from '../assets/swap/fit';
import { ModelLibrary, type ModelTemplate } from '../assets/swap/ModelLibrary';
import { WALL_THICKNESS } from './geometry';
import { DOOR_HEIGHT, buildGreybox, structureHeight } from './greybox';
import type { StructureSpec } from './layoutTypes';

/** Largest uniform scale of a Hexagon building: keeps a door under about 1.6x the Knight's height (door fits at 5.5). */
export const MAX_BUILDING_SCALE = 8.8;
const FENCE_HEIGHT = 1.0;
/** Dungeon wall pieces are 4 x 4 raw; this is the scale of a plain run (door opening 2.4 m wide). */
const DUNGEON_UNIT = 1.2;
/** Height of the opening in `dun/wall_doorway` at raw scale (its baked leaf is 2.75 tall). */
export const DOOR_OPENING_RAW = 2.75;

export type StructureArt = (spec: StructureSpec) => Promise<THREE.Object3D | null>;

type Place = (id: string, sx: number, sy: number, sz: number, x: number, z: number, rotY?: number, y?: number) => boolean;

export function createStructureArt(lib: ModelLibrary): StructureArt {
  return async (spec) => {
    switch (spec.kind) {
      case 'house':
        return fitted(lib, spec, ['hex/building_home_A_red', 'hex/building_home_B_red'][hashPick(spec.id, 2)], 7.4);
      case 'tavern':
        return fitted(lib, spec, 'hex/building_tavern_red', 8.5);
      case 'mill':
        return fitted(lib, spec, 'hex/building_windmill_red', MAX_BUILDING_SCALE);
      case 'well':
        return fitted(lib, spec, 'hex/building_well_red', 3);
      case 'pole':
        return pole(lib, spec);
      case 'fence':
      case 'yard-fence':
        return fence(lib, spec);
      case 'chapel':
      case 'bakery':
        return spec.mode === 'enterable' ? enterableShell(lib, spec) : null;
      default:
        return null;
    }
  };
}

async function fitted(lib: ModelLibrary, spec: StructureSpec, id: string, maxScale: number): Promise<THREE.Object3D | null> {
  const t = await lib.template(id);
  if (!t) return null;
  const [w, d] = spec.footprint;
  // A quarter turn when the model's long axis lies across the footprint's (the 12 x 10 tavern against a 1.17 x 1.33 model).
  const rx = t.bounds.max.x - t.bounds.min.x;
  const rz = t.bounds.max.z - t.bounds.min.z;
  const turn = Math.abs(Math.log(w / d) - Math.log(rz / rx)) < Math.abs(Math.log(w / d) - Math.log(rx / rz));
  const fit = fitToBox(t.bounds, turn ? { width: d, depth: w } : { width: w, depth: d }, { maxScale });
  const obj = ModelLibrary.object(t, fit);
  if (!turn) return obj;
  const holder = new THREE.Group();
  holder.name = obj.name;
  holder.rotation.y = Math.PI / 2;
  holder.add(obj);
  return holder;
}

async function pole(lib: ModelLibrary, spec: StructureSpec): Promise<THREE.Object3D | null> {
  const t = await lib.template('hal/post_lantern');
  if (!t) return null;
  const s = structureHeight(spec) / (t.bounds.max.y - t.bounds.min.y);
  return ModelLibrary.object(t, explicitFit(t.bounds, s, s, s));
}

/** Wooden fence pieces along the footprint's long edges (and all four for a yard fence). */
async function fence(lib: ModelLibrary, spec: StructureSpec): Promise<THREE.Object3D | null> {
  const t = await lib.template('hex/fence_wood_straight');
  if (!t) return null;
  const root = new THREE.Group();
  root.name = `fence:${spec.id}`;
  const raw = t.bounds.max.z - t.bounds.min.z;
  const s = Math.min(FENCE_HEIGHT, structureHeight(spec)) / (t.bounds.max.y - t.bounds.min.y);
  const [w, d] = spec.footprint;
  const run = (len: number, at: (c: number) => [number, number], rotY: number): void => {
    for (const piece of tileLine(len, raw * s)) {
      const [x, z] = at(piece.c);
      const holder = new THREE.Group();
      holder.position.set(x, 0, z);
      holder.rotation.y = rotY;
      holder.add(ModelLibrary.object(t, explicitFit(t.bounds, s, s, piece.len / raw)));
      root.add(holder);
    }
  };
  // The model runs along z; a run along x turns a quarter.
  const sides: Array<[number, (c: number) => [number, number], number]> =
    spec.kind === 'yard-fence'
      ? [
          [w, (c) => [c, -d / 2], Math.PI / 2],
          [w, (c) => [c, d / 2], Math.PI / 2],
          [d, (c) => [-w / 2, c], 0],
          [d, (c) => [w / 2, c], 0],
        ]
      : w >= d
        ? [[w, (c) => [c, 0], Math.PI / 2]]
        : [[d, (c) => [0, c], 0]];
  for (const [len, at, rot] of sides) run(len, at, rot);
  return root;
}

/**
 * The walkable shell of an enterable building from Dungeon wall pieces: four runs along the wall boxes, a doorway piece at the
 * door, upper rows when the building is taller than one piece. The greybox roof (and the chapel's tower stub) stays on top.
 */
async function enterableShell(lib: ModelLibrary, spec: StructureSpec): Promise<THREE.Object3D | null> {
  const ids = ['dun/wall', 'dun/wall_doorway', 'dun/wall_window_open'];
  const templates = await Promise.all(ids.map((id) => lib.template(id)));
  if (templates.some((t) => !t)) return null;
  const [wall, doorway, window] = templates as ModelTemplate[];
  const [w, d] = spec.footprint;
  const h = structureHeight(spec);
  const root = new THREE.Group();
  root.name = `shell:${spec.id}`;
  const unit = DUNGEON_UNIT;
  const rows = h >= 4 * unit + 1.5 ? Math.max(1, Math.round(h / (4 * unit))) : 1;
  const rowH = h / rows / 4;
  // The doorway piece is 4 raw tall; the leaf, and so the opening, is DOOR_OPENING_RAW of it.
  const place: Place = (id, sx, sy, sz, x, z, rotY = 0, y = 0) => {
    const t = id === 'dun/wall' ? wall : id === 'dun/wall_doorway' ? doorway : window;
    const holder = new THREE.Group();
    holder.position.set(x, y, z);
    holder.rotation.y = rotY;
    holder.add(ModelLibrary.object(t, explicitFit(t.bounds, sx, sy, sz)));
    root.add(holder);
    return true;
  };
  const sides = [
    { side: 'S', len: w, at: (c: number): [number, number] => [c, -d / 2 + WALL_THICKNESS / 2], rot: 0 },
    { side: 'N', len: w, at: (c: number): [number, number] => [c, d / 2 - WALL_THICKNESS / 2], rot: Math.PI },
    { side: 'W', len: d, at: (c: number): [number, number] => [-w / 2 + WALL_THICKNESS / 2, c], rot: Math.PI / 2 },
    { side: 'E', len: d, at: (c: number): [number, number] => [w / 2 - WALL_THICKNESS / 2, c], rot: -Math.PI / 2 },
  ];
  const thick = WALL_THICKNESS / 1.0;
  for (const s of sides) {
    const door = spec.door?.side === s.side ? spec.door : undefined;
    // Door side: the doorway piece sits at the middle (door fill boxes are centred on the wall), plain runs fill each side of it.
    const doorLen = door ? door.width * 2 : 0;
    const segments: Array<{ c: number; len: number; kind: 'wall' | 'door' }> = [];
    if (door) {
      const rest = (s.len - doorLen) / 2;
      for (const side of [-1, 1]) for (const p of tileLine(rest, 4 * unit)) segments.push({ c: side * (doorLen / 2 + rest / 2) + p.c, len: p.len, kind: 'wall' });
      segments.push({ c: 0, len: doorLen, kind: 'door' });
    } else {
      for (const p of tileLine(s.len, 4 * unit)) segments.push({ c: p.c, len: p.len, kind: 'wall' });
    }
    segments.forEach((seg, i) => {
      const [x, z] = s.at(seg.c);
      for (let r = 0; r < rows; r++) {
        const ground = r === 0;
        const useDoor = seg.kind === 'door' && ground;
        const id = useDoor ? 'dun/wall_doorway' : !ground || seg.kind === 'door' || i % 3 !== 1 ? 'dun/wall' : 'dun/wall_window_open';
        if (useDoor) {
          // The opening is DOOR_OPENING_RAW tall: scale it to the 2.6 m door slab and close the rest of the course with a lintel.
          const sy = DOOR_HEIGHT / DOOR_OPENING_RAW;
          place(id, seg.len / 4, sy, thick, x, z, s.rot, 0);
          const rest = rowH * 4 - 4 * sy;
          if (rest > 0.05) place('dun/wall', seg.len / 4, rest / 4, thick, x, z, s.rot, 4 * sy);
        } else {
          place(id, seg.len / 4, rowH, thick, x, z, s.rot, r * rowH * 4);
        }
      }
    });
  }
  // The greybox's roof and tower stub go on top; the wall and lintel boxes are replaced.
  const grey = buildGreybox(spec);
  for (const child of [...grey.children]) {
    if (child.name === 'wall' || child.name === 'lintel') {
      child.traverse((o) => (o as THREE.Mesh).isMesh && (o as THREE.Mesh).geometry.dispose());
      continue;
    }
    child.userData.ownGeometry = true;
    root.add(child);
  }
  return root;
}
