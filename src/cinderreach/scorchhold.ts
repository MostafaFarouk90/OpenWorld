// Scorchhold Fort on A1's SCORCHHOLD_PLATEAU: curtain walls with a south gate on the road's end, four corner towers, wall
// perches for the harpooners, the courtyard, the keep and its door (the keep interior is scorchholdKeep.ts), the quarry
// golems' spawns. The fort gate is an open arch: A7 and A12 build the destructible gate on `cinderreach.d03.gate`.
import type { LayoutData, StructureSpec } from '../region/layoutTypes';
import { a, numbered, open, solid } from './helpers';
import { SCORCHHOLD as F } from './sites';
import { ROAD_END_SCORCHHOLD } from './scorchholdRoad';

const HX = 100;
const HZ = 85;
const TOWER = 7;
const WALL_T = 3;
const WALL_H = 8;
const GATE_W = 14;

/** Where the keep's door stands outside (the interior floats over this point). */
export const KEEP_DOOR = { x: F.x, z: F.z + 32 };

/** The south gate's opening (D03's shut-gate toggle sits in it; A12). */
export const FORT_GATE = { x: ROAD_END_SCORCHHOLD.x, z: F.z - HZ, w: GATE_W, d: 1.5 } as const;

export function scorchholdLayout(): Pick<LayoutData, 'anchors' | 'triggers' | 'structures'> {
  const inset = TOWER / 2 + 0.3;
  const gx = ROAD_END_SCORCHHOLD.x;
  const west = { from: F.x - HX + inset, to: gx - GATE_W / 2 };
  const east = { from: gx + GATE_W / 2, to: F.x + HX - inset };
  const northLen = 2 * (HX - inset);
  const sideLen = 2 * (HZ - inset);
  const walls: StructureSpec[] = [
    solid('cinderreach-scorchhold-wall-n', 'wall', F.x, F.z + HZ, northLen, WALL_T, WALL_H),
    solid('cinderreach-scorchhold-wall-s1', 'wall', (west.from + west.to) / 2, F.z - HZ, west.to - west.from, WALL_T, WALL_H),
    solid('cinderreach-scorchhold-wall-s2', 'wall', (east.from + east.to) / 2, F.z - HZ, east.to - east.from, WALL_T, WALL_H),
    solid('cinderreach-scorchhold-wall-w', 'wall', F.x - HX, F.z, WALL_T, sideLen, WALL_H),
    solid('cinderreach-scorchhold-wall-e', 'wall', F.x + HX, F.z, WALL_T, sideLen, WALL_H),
    ...[
      [-1, -1],
      [1, -1],
      [-1, 1],
      [1, 1],
    ].map(([sx, sz], i) => solid(`cinderreach-scorchhold-tower-${i + 1}`, 'tower', F.x + sx * HX, F.z + sz * HZ, TOWER, TOWER, 14)),
  ];
  const perch = (id: string, wall: string, x: number, z: number) => a(id, x, z, 180, ['spawn', 'elevated'], { dy: WALL_H, onStructure: wall });
  return {
    anchors: [
      a('cinderreach.d03.gate', gx, F.z - HZ, 0, ['objective']),
      // D03's three charge points, a few metres outside the shut gate (A12).
      ...numbered('cinderreach.d03.gate', [[gx - 4, F.z - HZ - 3], [gx, F.z - HZ - 3], [gx + 4, F.z - HZ - 3]], ['objective'], 0),
      a('cinderreach.scorchhold.keep.door', KEEP_DOOR.x, KEEP_DOOR.z, 0, ['poi', 'door']),
      // Courtyard packs (1 to 6), quarry golems outside the west wall (7 and 8), harpooners on the walls.
      ...numbered('cinderreach.spawn.scorchhold', [[F.x - 50, F.z - 40], [F.x - 25, F.z - 55], [F.x + 20, F.z - 50], [F.x + 50, F.z - 35], [F.x - 40, F.z - 10], [F.x + 45, F.z - 10], [F.x - 115, F.z - 20], [F.x - 115, F.z + 20]], ['spawn'], 0),
      perch('cinderreach.spawn.scorchhold.perch.1', 'cinderreach-scorchhold-wall-n', F.x - 60, F.z + HZ),
      perch('cinderreach.spawn.scorchhold.perch.2', 'cinderreach-scorchhold-wall-n', F.x + 60, F.z + HZ),
      perch('cinderreach.spawn.scorchhold.perch.3', 'cinderreach-scorchhold-wall-e', F.x + HX, F.z),
      a('npc-post.osgar.scorchhold', F.x - 20, F.z - 65, 0, ['npc-post']),
      ...numbered('cinderreach.post.scorchhold', [[F.x - 30, F.z - 65]], ['npc-post'], 0),
    ],
    triggers: [],
    structures: [
      ...walls,
      open('cinderreach-scorchhold-gate', 'gate', gx, F.z - HZ, GATE_W, 1.5),
      solid('cinderreach-scorchhold-keep', 'tower', F.x, F.z + 45, 26, 20, 16),
    ],
  };
}
