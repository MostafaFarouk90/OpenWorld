// Wyrmwatch Lodge on K1's lodge plateau: curtain walls with a south gate and a pass gate, two towers, the long hall (its door is
// K1's `wyrmwatch-hall` pad door), bunkhouse, stables, the sled shed and stores (R15's depot), racks, the yard's unlit fire pit
// round K1's camp hearth, the south waystone and the lodge's posts. The ridge line of the hall roof is kept clear for PR 2.
import type { StructureSpec } from '../region/layoutTypes';
import { a, box, emptyPart, headingTo, open, solid, sphere, type Part } from './helpers';
import type { XZ } from './inputs';
import { Placer } from './placer';
import type { Sites } from './sites';

export const WALL_INSET = 10;
export const WALL_T = 3;
export const WALL_H = 5;
export const TOWER = 7;
export const TOWER_H = 11;
export const GATE_W = 12;
export const HALL_SIZE = { w: 40, d: 22, h: 10 } as const;
/** R15's haul is about this long on the road from the depot to the cache (the plan's 330 m). */
export const R15_LEG = 330;

export interface LodgeInfo {
  edge: { w: number; e: number; s: number; n: number };
  gateS: XZ;
  gateN: XZ;
  hall: { x: number; z: number; w: number; d: number; h: number };
  hallDoor: XZ;
  depot: XZ;
  sledStarts: XZ[];
  /** Road arc position of the pass gate (where the road crosses the north wall line). */
  passGateS: number;
  /** Road arc position of the cache. */
  cacheS: number;
  cache: XZ;
  towers: StructureSpec[];
  waystone: XZ;
  specs: StructureSpec[];
}

export function lodgeLayout(s: Sites): { part: Part; info: LodgeInfo } {
  const L = s.lodge;
  const edge = { w: L.minX + WALL_INSET, e: L.maxX - WALL_INSET, s: L.minZ + WALL_INSET, n: L.maxZ - WALL_INSET };
  // The pass gate is where the road leaves the yard through the north wall line (the road may start inside the yard or beyond it).
  const cross = s.road.crossNorth(edge.n);
  const passGateS = cross?.s ?? 0;
  const passX = Math.min(Math.max(cross?.x ?? s.road.point(0).x, edge.w + GATE_W * 2), edge.e - GATE_W * 2);
  const gateS = { x: L.cx, z: edge.s };
  const gateN = { x: passX, z: edge.n };
  const hz = (edge.n - edge.s) / 2;
  const mid = { x: (edge.e + edge.w) / 2, z: (edge.n + edge.s) / 2 };
  const inset = TOWER / 2 + 0.3;
  const wall = (id: string, x0: number, x1: number, z: number): StructureSpec => solid(id, 'wall', (x0 + x1) / 2, z, x1 - x0, WALL_T, WALL_H);

  const towerSpecs = [edge.w, edge.e].map((x, i) => solid(`dragonspine-lodge-tower-${i + 1}`, 'tower', x, edge.s, TOWER, TOWER, TOWER_H));
  const walls: StructureSpec[] = [
    wall('dragonspine-lodge-wall-n1', edge.w + inset, gateN.x - GATE_W / 2, edge.n),
    wall('dragonspine-lodge-wall-n2', gateN.x + GATE_W / 2, edge.e - inset, edge.n),
    wall('dragonspine-lodge-wall-s1', edge.w + inset, gateS.x - GATE_W / 2, edge.s),
    wall('dragonspine-lodge-wall-s2', gateS.x + GATE_W / 2, edge.e - inset, edge.s),
    solid('dragonspine-lodge-wall-w', 'wall', edge.w, mid.z + inset / 2, WALL_T, 2 * hz - inset, WALL_H),
    solid('dragonspine-lodge-wall-e', 'wall', edge.e, mid.z + inset / 2, WALL_T, 2 * hz - inset, WALL_H),
    ...towerSpecs,
    open('dragonspine-lodge-gate-south', 'gate', gateS.x, gateS.z, GATE_W, 1.5),
    open('dragonspine-lodge-gate-pass', 'gate', gateN.x, gateN.z, GATE_W, 1.5),
  ];

  // The hall stands north of its door (the pad's outside door), south face to the door.
  const door = s.hallPad.door;
  const hall = { x: door.x, z: door.z + 3 + HALL_SIZE.d / 2, w: HALL_SIZE.w, d: HALL_SIZE.d, h: HALL_SIZE.h };
  const hallSpec = solid('dragonspine-hall', 'dragonspine-hall', hall.x, hall.z, hall.w, hall.d, hall.h);

  const yard: Placer = new Placer({ minX: edge.w + 3, maxX: edge.e - 3, minZ: edge.s + 3, maxZ: edge.n - 3 }, s.road, s.roadClear);
  for (const w of [...walls, hallSpec]) yard.add(w);
  yard.reserve(s.hearth.x, s.hearth.z, 7);
  yard.reserve(gateS.x, gateS.z + 10, 12);
  yard.reserve(gateN.x, gateN.z - 10, 12);
  yard.reserve(door.x, door.z - 4, 5);

  const shed = yard.place('dragonspine-sled-shed', 'dragonspine-shed', { x: gateN.x + 28, z: edge.n - 14 }, 18, 10);
  // The depot in front of the shed (three sled starts and the hands' posts) stays open.
  yard.reserve(shed.x, shed.z - shed.footprint[1] / 2 - 6, 9);
  const bunk = yard.place('dragonspine-bunkhouse', 'house', { x: L.cx + 30, z: L.cz + 24 }, 24, 9);
  const stable = yard.place('dragonspine-stable', 'dragonspine-stable', { x: L.cx + 38, z: L.cz - 20 }, 20, 8);
  const stores = [
    yard.place('dragonspine-stores-1', 'house', { x: L.cx - 32, z: L.cz - 26 }, 12, 8),
    yard.place('dragonspine-stores-2', 'house', { x: L.cx - 50, z: L.cz - 8 }, 10, 8),
  ];
  const racks = [
    yard.place('dragonspine-skinning-rack', 'dragonspine-rack', { x: L.cx - 18, z: L.cz - 30 }, 5, 2, { mode: 'open' }),
    yard.place('dragonspine-trophy-rack-1', 'dragonspine-rack', { x: L.cx + 14, z: L.cz - 4 }, 5, 2, { mode: 'open' }),
    yard.place('dragonspine-trophy-rack-2', 'dragonspine-rack', { x: L.cx + 20, z: L.cz - 4 }, 5, 2, { mode: 'open' }),
  ];
  const pit = open('dragonspine-yard-fire-pit', 'dragonspine-fire-pit', s.hearth.x, s.hearth.z, 3.2, 3.2);

  const shedFront = { x: shed.x, z: shed.z - shed.footprint[1] / 2 - 3 };
  const sledStarts = [-4, 0, 4].map((dx) => ({ x: shedFront.x + dx, z: shedFront.z - 2 }));
  const stableFront = { x: stable.x, z: stable.z - stable.footprint[1] / 2 - 2.5 };
  const depotToGate = Math.hypot(shedFront.x - gateN.x, shedFront.z - gateN.z);
  const cacheS = passGateS + Math.max(120, R15_LEG - depotToGate);
  const cacheP = s.road.point(cacheS, -s.roadClear - 3);
  const cache = { x: cacheP.x, z: cacheP.z };

  const wayX = gateS.x - 14;
  const wayZ = edge.s - 6;
  const sw = towerSpecs[0]!;
  const anchors = [
    a('waystone.wyrmwatch-lodge', wayX, wayZ, 0, ['waystone']),
    a('dragonspine.lodge.gate.south', gateS.x, edge.s - 4, 0, ['poi']),
    a('dragonspine.lodge.gate.pass', gateN.x, edge.n + 4, 0, ['poi']),
    a('dragonspine.lodge.hall.door', door.x, door.z, 180, ['poi']),
    a('dragonspine.lodge.sled-shed', shedFront.x, shedFront.z, 180, ['objective']),
    ...sledStarts.map((p, i) => a(`dragonspine.r15.sled-start.${i + 1}`, p.x, p.z, 0, ['objective'])),
    a('dragonspine.r15.cache', cache.x, cache.z, 0, ['objective']),
    ...[0.3, 0.6, 0.85].map((f, i) => {
      const p = s.road.point(passGateS + (cacheS - passGateS) * f, 16);
      return a(`dragonspine.spawn.r15.stoop-${i + 1}`, p.x, p.z, 0, ['spawn']);
    }),
    a('dragonspine.lodge.stables', stableFront.x, stableFront.z, 180, ['poi']),
    a('dragonspine.lodge.yard', L.cx, L.cz - 14, 0, ['poi']),
    // Posts: they face inward (the hold guards against the dragons); PR 2 turns the hunters out after the midpoint.
    a('npc-post.thorgar.yard', s.hearth.x + 4, s.hearth.z + 3, headingTo(s.hearth.x + 4, s.hearth.z + 3, s.hearth.x, s.hearth.z), ['npc-post']),
    a('npc-post.lodge-hunter-1', gateS.x - 8, edge.s + 5, 0, ['npc-post']),
    a('npc-post.lodge-hunter-2', gateS.x + 8, edge.s + 5, 0, ['npc-post']),
    a('npc-post.lodge-hunter-3', sw.x, sw.z, 0, ['npc-post', 'elevated'], { onStructure: sw.id, dy: TOWER_H }),
    a('npc-post.lodge-hunter-4', L.cx - 12, L.cz - 14, 90, ['npc-post']),
    a('npc-post.lodge-hunter-5', door.x - 3, door.z - 4, 0, ['npc-post']),
    a('npc-post.lodge-hunter-6', door.x + 3, door.z - 4, 0, ['npc-post']),
    ...[-3, 3].map((dx, i) => a(`npc-post.sled-hand-${i + 1}`, shedFront.x + dx, shedFront.z - 7, 0, ['npc-post'])),
  ];

  const part: Part = {
    ...emptyPart(),
    anchors,
    triggers: [
      sphere('trg.dragonspine.lodge', L.cx, L.cz, Math.hypot(L.w, L.d) / 2),
      box('trg.dragonspine.lodge.hall.door', door.x, door.z, 6, 4, 4),
    ],
    structures: [
      ...walls,
      hallSpec,
      bunk,
      stable,
      shed,
      ...stores,
      ...racks,
      pit,
      solid('dragonspine-waystone-wyrmwatch-lodge', 'waystone', wayX, wayZ + 1.8, 1.6, 1.6, 2.4),
    ],
  };
  return {
    part,
    info: { edge, gateS, gateN, hall, hallDoor: door, depot: shedFront, sledStarts, passGateS, cacheS, cache, towers: towerSpecs, waystone: { x: wayX, z: wayZ }, specs: part.structures },
  };
}
