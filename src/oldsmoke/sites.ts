// Where Deepgate's places stand. Every position derives from A1's exported plateau box, pass road and stack positions
// (src/terrain/shape/oldsmokePass.ts), never from copied coordinates: move the plateau and the town moves with it.
import { DEEPGATE_PLATEAU, OLDSMOKE_PASS_POINTS, OLDSMOKE_STACKS } from '../terrain/shape/oldsmokePass';

export const BOX = DEEPGATE_PLATEAU.box;
export const CENTRE = { x: (BOX.minX + BOX.maxX) / 2, z: (BOX.minZ + BOX.maxZ) / 2 };

/** Curtain walls stand this far inside the plateau's edge. Small, because stack 3 sits 20 m from the east edge. */
export const WALL_INSET = 8;
export const WALL_T = 3.5;
export const WALL_H = 6;
export const TOWER = 8;
export const GATE_W = 14;
/** Wall centre lines. */
export const EDGE = { w: BOX.minX + WALL_INSET, e: BOX.maxX - WALL_INSET, s: BOX.minZ + WALL_INSET, n: BOX.maxZ - WALL_INSET };

/** Where the pass road meets the plateau (the last point of A1's polyline). */
const PASS_END = OLDSMOKE_PASS_POINTS[OLDSMOKE_PASS_POINTS.length - 1];
export const GATE = { x: PASS_END[0], z: EDGE.s };

/** The market square's centre, 77 m inside the gate on the road's line. */
export const MARKET = { x: GATE.x, z: EDGE.s + 77 };
/** Grisel Hall's footprint centre, north-centre of the town; its door stands 3 m in front of the south face. */
export const HALL = { x: CENTRE.x + 10, z: CENTRE.z + 85, w: 44, d: 30, h: 14 };
export const HALL_DOOR = { x: HALL.x, z: HALL.z - HALL.d / 2 - 3 };
/** The shaft head's collar, in the north-west quarter. */
export const SHAFT = { x: BOX.minX + 85, z: BOX.minZ + 300 };

export const STACKS = OLDSMOKE_STACKS;

/** Circles other layouts keep clear of (A2's POI placement): centre and radius per site. */
export const OLDSMOKE_KEEP_OUT: ReadonlyArray<{ id: string; x: number; z: number; r: number }> = [
  { id: 'deepgate', x: CENTRE.x, z: CENTRE.z, r: 380 },
  { id: 'deepgate-gate', x: GATE.x, z: GATE.z, r: 60 },
  { id: 'shaft-head', x: SHAFT.x, z: SHAFT.z, r: 60 },
];
