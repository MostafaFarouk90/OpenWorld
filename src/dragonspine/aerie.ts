// Frostfang Aerie (D06, PR 2) on K1's frostfang-aerie plateau, east of the chasm: curtain walls with four towers (the lodge's
// Hexagon art kit), the aerie gate in the west wall facing the landing shelf (its blocker is worldChanges.ts's: closed until
// K13's `story.d06.gateOpen`) with the winch outside it, the keep's shell over K1's keep pad (the `frostfang-keep` interior
// floats over the same pad; its door opens on `story.d06.started`), the courtyard (the Skarl and drake fight space for K8:
// `dragonspine.aerie.arena.*`), a caged hawk, the drake's chain-post, the searches, `waystone.frostfang-aerie` at K1's
// `FROSTFANG_WAYSTONE` outside the walls (attuned on arrival, see chasmCatch.ts's arrival watcher), the landing shelf the
// walker catch returns to, and the spawn anchors for 8 courtyard hunters and 4 wall harpooners (area `dragonspine-summit`).
import type { StructureSpec } from '../region/layoutTypes';
import { a, box, emptyPart, headingTo, open, ring, solid, type Part } from './helpers';
import type { XZ } from './inputs';
import { Placer } from './placer';
import { freeStand, type SummitSites } from './summitSites';
import { ARRIVAL_HALF_Y } from './chasmCatch';

export const AERIE_WALL_T = 3;
export const AERIE_WALL_H = 6;
export const AERIE_TOWER = 7;
export const AERIE_TOWER_H = 12;
export const AERIE_GATE_W = 12;
/** The west wall stands this far inside the plateau's west edge (the landing shelf is outside it). */
const SHELF = 45;
/** The south wall stands this far north of the waystone, which stays outside the walls. */
const WAYSTONE_CLEAR = 22;
const EDGE = 8;
export const KEEP_SHELL = { w: 28, d: 22, h: 14 } as const;
export const ARENA_RADIUS = 26;
/** The spawn area of everything here (K6b PR 2 and K8 pass it as `SpawnerDef.area`). */
export const AERIE_AREA = 'dragonspine-summit' as const;

export interface AerieInfo {
  edge: { w: number; e: number; s: number; n: number };
  gate: XZ;
  /** The gate blocker's footprint (worldChanges.ts builds it as a toggle). */
  gateSpec: StructureSpec;
  winch: XZ;
  keepDoor: XZ;
  arena: XZ;
  landing: XZ;
  waystone: XZ;
  towers: StructureSpec[];
  /** The tower the drake roosts on after D06 (the north-east one). */
  roostTower: StructureSpec;
  /** The walk a player makes in the Aerie (D06's foot leg): landing (the waystone attunes on arrival), winch, gate, the courtyard's searches, the arena, the keep door. */
  route: XZ[];
  specs: StructureSpec[];
}

const fail = (msg: string): never => {
  throw new Error(`dragonspine: ${msg}`);
};

export function aerieLayout(s: SummitSites): { part: Part; info: AerieInfo } {
  const A = s.aerie;
  const W = s.waystone;
  const pad = s.keepPad.footprint;
  const edge = { w: A.minX + SHELF, e: A.maxX - EDGE, s: W.z + WAYSTONE_CLEAR, n: A.maxZ - EDGE };
  if (W.x < A.minX || W.x > A.maxX || W.z < A.minZ || W.z > A.maxZ) fail('the Frostfang waystone is off the Aerie plateau');
  if (pad.minX < edge.w + 6 || pad.maxX > edge.e - 6 || pad.minZ < edge.s + 40 || pad.maxZ > edge.n - AERIE_WALL_T) fail('the frostfang-keep pad does not fit inside the Aerie\'s walls');
  const keep = { x: (pad.minX + pad.maxX) / 2, z: (pad.minZ + pad.maxZ) / 2 };
  const keepFront = keep.z - KEEP_SHELL.d / 2;
  const arena = { x: (edge.w + edge.e) / 2, z: (edge.s + keepFront) / 2 };
  const gate = { x: edge.w, z: arena.z };
  const inset = AERIE_TOWER / 2 + 0.3;
  const wallX = (id: string, x0: number, x1: number, z: number) => solid(id, 'wall', (x0 + x1) / 2, z, x1 - x0, AERIE_WALL_T, AERIE_WALL_H);
  const wallZ = (id: string, x: number, z0: number, z1: number) => solid(id, 'wall', x, (z0 + z1) / 2, AERIE_WALL_T, z1 - z0, AERIE_WALL_H);
  const towers = [
    [edge.w, edge.s],
    [edge.e, edge.s],
    [edge.w, edge.n],
    [edge.e, edge.n],
  ].map(([x, z], i) => solid(`dragonspine-aerie-tower-${i + 1}`, 'tower', x!, z!, AERIE_TOWER, AERIE_TOWER, AERIE_TOWER_H));
  const wallS = wallX('dragonspine-aerie-wall-s', edge.w + inset, edge.e - inset, edge.s);
  const wallN = wallX('dragonspine-aerie-wall-n', edge.w + inset, edge.e - inset, edge.n);
  const wallE = wallZ('dragonspine-aerie-wall-e', edge.e, edge.s + inset, edge.n - inset);
  const wallW1 = wallZ('dragonspine-aerie-wall-w1', edge.w, edge.s + inset, gate.z - AERIE_GATE_W / 2);
  const wallW2 = wallZ('dragonspine-aerie-wall-w2', edge.w, gate.z + AERIE_GATE_W / 2, edge.n - inset);
  const gateFrame = open('dragonspine-aerie-gate-frame', 'gate', gate.x, gate.z, 1.5, AERIE_GATE_W);
  const gateSpec = solid('dragonspine-aerie-gate', 'dragonspine-aerie-gate', gate.x, gate.z, 1.5, AERIE_GATE_W, AERIE_WALL_H);
  const shell = solid('dragonspine-aerie-keep', 'dragonspine-keep', keep.x, keep.z, KEEP_SHELL.w, KEEP_SHELL.d, KEEP_SHELL.h);
  const winch = solid('dragonspine-aerie-winch', 'dragonspine-winch', gate.x - 5, gate.z + AERIE_GATE_W / 2 + 3, 1.6, 1.2, 1.4);
  const waystone = solid('dragonspine-waystone-frostfang-aerie', 'waystone', W.x, W.z + 1.8, 1.6, 1.6, 2.4);
  const walls = [wallS, wallN, wallE, wallW1, wallW2, ...towers];

  const yard = new Placer({ minX: edge.w + 4, maxX: edge.e - 4, minZ: edge.s + 4, maxZ: edge.n - 4 }, null, 0);
  for (const w of [...walls, shell]) yard.add(w);
  yard.reserve(arena.x, arena.z, 8);
  yard.reserve(gate.x + 8, gate.z, 8);
  yard.reserve(keep.x, keepFront - 4, 6);
  const cage = yard.place('dragonspine-aerie-hawk-cage', 'dragonspine-hawk-cage', { x: edge.e - 22, z: edge.s + 22 }, 1.6, 1.6, { height: 2, margin: 2 });
  const chain = yard.place('dragonspine-aerie-chain-post', 'dragonspine-chain-post', { x: arena.x + 14, z: arena.z + 12 }, 0.8, 0.8, { height: 2.5, margin: 2 });
  const table = yard.place('dragonspine-aerie-table', 'dragonspine-rig-table', { x: edge.w + 18, z: edge.n - 22 }, 2.4, 1.2, { mode: 'open', margin: 2 });
  const trough = yard.place('dragonspine-aerie-feed-trough', 'dragonspine-feed-trough', { x: chain.x + 7, z: chain.z + 4 }, 2.4, 1, { mode: 'open', margin: 2 });
  const yardSpecs = [cage, chain, table, trough];

  const keepDoor = { x: keep.x, z: keepFront - 3 };
  const winchAt = { x: winch.x, z: winch.z - 1.8 };
  const lt = s.ledges['summit-aerie'];
  const shelfBox = { minX: A.minX + 4, maxX: edge.w - 6, minZ: A.minZ + 4, maxZ: A.maxZ - 4 };
  const landing = freeStand(s.h, lt.target, { radius: 60, maxGrad: 0.1, within: shelfBox, avoid: [...walls, winch, waystone], clear: 3 }) ?? fail('no landing shelf on the Aerie');
  const posts = (spec: StructureSpec, along: 'x' | 'z', offs: readonly number[], prefix: string, tags: string[]) =>
    offs.map((o, i) => {
      const x = along === 'x' ? arena.x + o : spec.x;
      const z = along === 'x' ? spec.z : arena.z + o;
      return a(`${prefix}${i + 1}`, x, z, headingTo(x, z, arena.x, arena.z), tags, { onStructure: spec.id, dy: AERIE_WALL_H });
    });
  const hunters = ring(arena.x, arena.z, 18, 8, 22.5);
  const anchors = [
    a('waystone.frostfang-aerie', W.x, W.z, 0, ['waystone']),
    a('dragonspine.aerie.landing', landing.x, landing.z, 90, ['poi']),
    a('dragonspine.aerie.gate', gate.x - 4, gate.z, 90, ['poi']),
    a('dragonspine.aerie.gate.winch', winchAt.x, winchAt.z, 0, ['objective']),
    a('dragonspine.aerie.courtyard', gate.x + 10, gate.z, 90, ['poi']),
    a('dragonspine.aerie.keep.door', keepDoor.x, keepDoor.z, 180, ['poi']),
    a('dragonspine.aerie.arena.centre', arena.x, arena.z, 0, ['objective', 'arena-centre']),
    ...[0, 90, 180, 270].map((b, i) => {
      const r = (b * Math.PI) / 180;
      return a(`dragonspine.aerie.arena.edge.${i + 1}`, arena.x + Math.sin(r) * ARENA_RADIUS, arena.z + Math.cos(r) * ARENA_RADIUS, (b + 180) % 360, ['poi']);
    }),
    a('dragonspine.aerie.arena.skarl', arena.x, arena.z + 10, 180, ['poi']),
    a('dragonspine.aerie.arena.drake', chain.x - 2.5, chain.z, 90, ['poi']),
    ...posts(wallS, 'x', [-24, 24], 'dragonspine.aerie.arena.wall.', ['poi', 'elevated']),
    ...posts(wallE, 'z', [-20, 20], 'dragonspine.aerie.arena.wall.', ['poi', 'elevated']).map((p, i) => ({ ...p, id: `dragonspine.aerie.arena.wall.${i + 3}` })),
    a('dragonspine.aerie.hawk-cage', cage.x, cage.z - 2, 0, ['objective']),
    a('dragonspine.aerie.chain-post', chain.x, chain.z - 1.8, 0, ['objective']),
    // Searches: a list of nests (the hunters' table) and the drake's feed log (by the trough).
    a('dragonspine.aerie.search.1', table.x, table.z - 1.8, 0, ['objective']),
    a('dragonspine.aerie.search.2', trough.x, trough.z - 1.6, 0, ['objective']),
    ...hunters.map(([x, z], i) => a(`dragonspine.spawn.aerie.hunter-${i + 1}`, x, z, headingTo(x, z, gate.x, gate.z), ['spawn'])),
    ...posts(wallS, 'x', [-36, 36], 'dragonspine.spawn.aerie.harpooner-', ['spawn', 'elevated']),
    ...posts(wallE, 'z', [-30, 30], 'dragonspine.spawn.aerie.harpooner-', ['spawn', 'elevated']).map((p, i) => ({ ...p, id: `dragonspine.spawn.aerie.harpooner-${i + 3}` })),
  ];
  const part: Part = {
    ...emptyPart(),
    anchors,
    triggers: [
      // The arrival trigger: anywhere on the shelf (the arrival watcher attunes the waystone while the player is in it).
      box('trg.dragonspine.aerie.arrival', A.cx, A.cz, A.w / 2, ARRIVAL_HALF_Y, A.d / 2),
      box('trg.dragonspine.aerie.courtyard', (edge.w + edge.e) / 2, (edge.s + edge.n) / 2, (edge.e - edge.w) / 2, 10, (edge.n - edge.s) / 2),
      box('trg.dragonspine.aerie.keep.door', keepDoor.x, keepDoor.z, 6, 4, 4),
    ],
    structures: [...walls, gateFrame, shell, winch, waystone, ...yardSpecs],
  };
  const route: XZ[] = [landing, winchAt, { x: gate.x - 4, z: gate.z }, { x: gate.x + 6, z: gate.z }, { x: table.x, z: table.z - 1.8 }, { x: cage.x, z: cage.z - 2 }, { x: chain.x, z: chain.z - 1.8 }, { x: trough.x, z: trough.z - 1.6 }, arena, keepDoor];
  return {
    part,
    info: { edge, gate, gateSpec, winch: winchAt, keepDoor, arena, landing, waystone: W, towers, roostTower: towers[3]!, route, specs: part.structures },
  };
}
