// Deepgate on A1's DEEPGATE_PLATEAU (exactly flat): curtain walls with a gate on the pass road's end, four corner towers, the
// market square, the miners' rows and hall, the stewards' barracks and office, the paymaster's office, Grisel Hall's exterior
// with its forecourt (M16's braziers) and the posts. Hall guards, hall NPCs and the stealth section live in the interior
// (griselHall.ts). The shaft head is shaftHead.ts, the furnace houses furnaces.ts.
import type { LayoutData, StructureSpec } from '../region/layoutTypes';
import { a, box, numbered, open, solid, sphere } from './helpers';
import { BOX, EDGE, GATE, GATE_W, HALL, HALL_DOOR, MARKET as M, NORTH_GATE, TOWER, WALL_H, WALL_T } from './sites';

const HX = (EDGE.e - EDGE.w) / 2;
const HZ = (EDGE.n - EDGE.s) / 2;
const MID = { x: (EDGE.e + EDGE.w) / 2, z: (EDGE.n + EDGE.s) / 2 };
const TOWER_H = 12;

/** The miners' hall and the stewards' office (R10's two sides), and the paymaster's office (R09). */
export const MINERS_HALL = { x: BOX.minX + 140, z: BOX.minZ + 85, w: 12, d: 9 };
export const STEWARDS_OFFICE = { x: BOX.minX + 395, z: BOX.minZ + 95, w: 10, d: 8 };
export const PAYMASTER = { x: M.x + 75, z: M.z + 35, w: 10, d: 8 };

/** The north wall from x `from` to `to`, in two pieces either side of the north gate. */
function northWall(from: number, to: number): StructureSpec[] {
  const w = { from, to: NORTH_GATE.x - GATE_W / 2 };
  const e = { from: NORTH_GATE.x + GATE_W / 2, to };
  return [
    solid('oldsmoke-wall-n1', 'wall', (w.from + w.to) / 2, EDGE.n, w.to - w.from, WALL_T, WALL_H),
    solid('oldsmoke-wall-n2', 'wall', (e.from + e.to) / 2, EDGE.n, e.to - e.from, WALL_T, WALL_H),
  ];
}

export function deepgateLayout(): Pick<LayoutData, 'anchors' | 'triggers' | 'structures'> {
  const inset = TOWER / 2 + 0.3;
  const west = { from: EDGE.w + inset, to: GATE.x - GATE_W / 2 };
  const east = { from: GATE.x + GATE_W / 2, to: EDGE.e - inset };
  const northLen = 2 * (HX - inset);
  const sideLen = 2 * (HZ - inset);
  const walls: StructureSpec[] = [
    // Act 3 (K1): the north wall opens on the Deepgate Track's gate (NORTH_GATE).
    ...northWall(EDGE.w + inset, EDGE.w + inset + northLen),
    solid('oldsmoke-wall-s1', 'wall', (west.from + west.to) / 2, EDGE.s, west.to - west.from, WALL_T, WALL_H),
    solid('oldsmoke-wall-s2', 'wall', (east.from + east.to) / 2, EDGE.s, east.to - east.from, WALL_T, WALL_H),
    solid('oldsmoke-wall-w', 'wall', EDGE.w, MID.z, WALL_T, sideLen, WALL_H),
    solid('oldsmoke-wall-e', 'wall', EDGE.e, MID.z, WALL_T, sideLen, WALL_H),
    ...(
      [
        [EDGE.w, EDGE.s],
        [EDGE.e, EDGE.s],
        [EDGE.w, EDGE.n],
        [EDGE.e, EDGE.n],
      ] as const
    ).map(([x, z], i) => solid(`oldsmoke-tower-${i + 1}`, 'tower', x, z, TOWER, TOWER, TOWER_H)),
    open('oldsmoke-gate', 'gate', GATE.x, GATE.z, GATE_W, 1.5),
    open('oldsmoke-gate-north', 'gate', NORTH_GATE.x, NORTH_GATE.z, GATE_W, 1.5),
  ];

  // Market stalls: three each side of the lane, the well in the lane's head.
  const stalls = [-13, 0, 13].flatMap((dz) => [-28, 28].map((dx) => ({ x: M.x + dx, z: M.z + dz, front: dx < 0 ? 90 : 270 })));
  const rowHouse = (id: string, x: number, z: number, w = 8, d = 8, kind: StructureSpec['kind'] = 'house') => solid(id, kind, x, z, w, d);
  const houses: StructureSpec[] = [
    // Miners' rows (west): two columns of three.
    ...[BOX.minX + 50, BOX.minX + 85].flatMap((x, c) => [BOX.minZ + 50, BOX.minZ + 85, BOX.minZ + 120].map((z, r) => rowHouse(`oldsmoke-miner-house-${c * 3 + r + 1}`, x, z))),
    rowHouse('oldsmoke-miners-hall', MINERS_HALL.x, MINERS_HALL.z, MINERS_HALL.w, MINERS_HALL.d),
    // Stewards' quarters (east).
    solid('oldsmoke-barracks', 'deepgate-barracks', BOX.minX + 395, BOX.minZ + 50, 22, 14),
    rowHouse('oldsmoke-stewards-office', STEWARDS_OFFICE.x, STEWARDS_OFFICE.z, STEWARDS_OFFICE.w, STEWARDS_OFFICE.d),
    rowHouse('oldsmoke-steward-house-1', BOX.minX + 440, BOX.minZ + 50),
    rowHouse('oldsmoke-steward-house-2', BOX.minX + 440, BOX.minZ + 95),
    rowHouse('oldsmoke-paymaster-office', PAYMASTER.x, PAYMASTER.z, PAYMASTER.w, PAYMASTER.d),
  ];

  const braziers = [-18, 0, 18].map((dx) => ({ x: HALL_DOOR.x + dx, z: HALL_DOOR.z - 20 }));
  const cx = M.x;
  const cz = M.z;

  return {
    anchors: [
      a('waystone.deepgate', cx - 40, cz - 20, 0, ['waystone']),
      // The gate check (M16's arrival, A13) and the two gate stewards' posts.
      a('oldsmoke.gate', GATE.x, GATE.z + 4, 0, ['poi']),
      a('oldsmoke.gate.guard.1', GATE.x - 9, GATE.z + 5, 180, ['npc-post']),
      a('oldsmoke.gate.guard.2', GATE.x + 9, GATE.z + 5, 180, ['npc-post']),
      // The market square: the centre, the stall fronts, four guard posts (R10 decides who stands on them), Slagg's market post.
      a('oldsmoke.market.centre', cx, cz, 0, ['poi']),
      ...stalls.map((s, i) => a(`oldsmoke.market.stall.${i + 1}`, s.x + (s.front === 90 ? 4 : -4), s.z, s.front, ['poi'])),
      ...numbered('oldsmoke.market.guard', [[cx - 14, cz - 22], [cx + 14, cz - 22], [cx - 14, cz + 24], [cx + 14, cz + 24]], ['npc-post'], 180),
      a('npc-post.slagg.market', cx + 12, cz - 4, 270, ['npc-post']),
      // The market's idlers (miners), and R09: three crawler nests at the square's edges, a payroll chest by each, the paymaster's office.
      ...numbered('npc-post.miner', [[cx - 10, cz + 14], [cx + 10, cz + 16]], ['npc-post'], 0),
      ...numbered('oldsmoke.market.nest', [[cx - 50, cz + 20], [cx + 52, cz + 18], [cx + 4, cz + 34]], ['spawn'], 0),
      ...numbered('oldsmoke.market.chest', [[cx - 45, cz + 25], [cx + 47, cz + 23], [cx + 10, cz + 38]], ['objective'], 0),
      ...numbered('oldsmoke.market.office', [-8, 0, 8].map((dx) => [PAYMASTER.x + dx, PAYMASTER.z - PAYMASTER.d / 2 - 4] as const), ['objective'], 180),
      // R10's two sides: the miners' hall and the stewards' office, a talk point in front of each.
      a('oldsmoke.r10.hall.miners', MINERS_HALL.x, MINERS_HALL.z - MINERS_HALL.d / 2 - 3, 180, ['objective']),
      a('oldsmoke.r10.hall.stewards', STEWARDS_OFFICE.x, STEWARDS_OFFICE.z - STEWARDS_OFFICE.d / 2 - 3, 180, ['objective']),
      // Grisel Hall's outside door, its forecourt (M16's rekindle happens here, not in the hall) and the home posts of the hall's cast
      // (POST_RULES moves them to the interior's own posts).
      a('oldsmoke.hall.door', HALL_DOOR.x, HALL_DOOR.z, 180, ['poi']),
      ...numbered('oldsmoke.m16.brazier', braziers.map((b) => [b.x, b.z] as const), ['objective'], 180),
      a('oldsmoke.hall.court', HALL_DOOR.x, HALL_DOOR.z - 12, 0, ['poi']),
      a('npc-post.aldous.court', HALL_DOOR.x - 3, HALL_DOOR.z - 8, 0, ['npc-post']),
      a('npc-post.wenna.court', HALL_DOOR.x + 3, HALL_DOOR.z - 8, 0, ['npc-post']),
      ...numbered('npc-post.steward-hall', [-8, -4, 4, 8].map((dx) => [HALL_DOOR.x + dx, HALL_DOOR.z - 5] as const), ['npc-post'], 0),
    ],
    triggers: [
      sphere('trg.oldsmoke.gate', GATE.x, GATE.z, 16),
      sphere('trg.oldsmoke.market', cx, cz, 45),
      sphere('trg.oldsmoke.hall.forecourt', HALL_DOOR.x, HALL_DOOR.z - 12, 24),
      box('trg.oldsmoke.hall.door', HALL_DOOR.x, HALL_DOOR.z, 6, 4, 4),
    ],
    structures: [
      ...walls,
      ...houses,
      solid('oldsmoke-well', 'well', cx, cz + 10, 2, 2),
      ...stalls.map((s, i) => solid(`oldsmoke-stall-${i + 1}`, 'stall', s.x, s.z, 5, 3, undefined, s.front === 90 ? 90 : 270)),
      solid('oldsmoke-hall', 'deepgate-hall', HALL.x, HALL.z, HALL.w, HALL.d, HALL.h),
      ...braziers.map((b, i) => open(`oldsmoke-brazier-${i + 1}`, 'deepgate-brazier', b.x, b.z, 1.4, 1.4)),
      solid('oldsmoke-waystone-deepgate', 'waystone', cx - 40, cz - 20 + 1.8, 1.6, 1.6, 2.4),
    ],
  };
}
