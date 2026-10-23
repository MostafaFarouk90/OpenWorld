// Deepdelve (A4 PR 2): three descents in series along a furnace-lit gallery, two valve rooms and the Slagmaw's arena at the far end.
// Local metres from the lift landing; the rooms run east (x up to 180, inside the 220 m this mine may use), yaw 0 faces -Z.
import type { InteriorDef, LocalRect, PropDef } from '../../interiors/types';
import { corridor, MINE_IDS, mineDef, rect, room, torchesAlong } from './kit';

export const DEEPDELVE_ARENA_GATE = 'deepdelve.slagmaw.arena.gate';
export const DEEPDELVE_ARENA_TRIGGER = 'trg.deepdelve.slagmaw.arena';

/** The arena: flat open 30 x 30 m floor; its west wall is the entrance. */
export const DEEPDELVE_ARENA = rect(150, -35, 180, -5);
export const DEEPDELVE_ARENA_CENTRE = { x: 165, z: -20 } as const;
/** Lava-pool dressing stays this close to the arena walls so the floor inside is clear. */
export const DEEPDELVE_ARENA_RIM = 1.5;

const landing = room('landing', -6, -26, 14, 27, 4);
const lead1 = corridor('lead.1', { x: 8, z: -20 }, { x: 28, z: -20 }, 4);
const stage1 = room('stage.1', 28, -35, 30, 30, 6);
const lead2 = corridor('lead.2', { x: 58, z: -20 }, { x: 78, z: -20 }, 4);
const stage2 = room('stage.2', 78, -35, 30, 30, 6);
// The way on from the second descent to the arena; the gate sits at its east end.
const approach = corridor('approach', { x: 108, z: -20 }, { x: 150, z: -20 }, 4);
const arena = { id: 'arena', ...DEEPDELVE_ARENA, height: 10 };
const valveRoom1 = room('valve.room.1', 36, -58, 16, 15, 4);
const valveLink1 = corridor('valve.link.1', { x: 44, z: -43 }, { x: 44, z: -35 }, 3);
const valveRoom2 = room('valve.room.2', 86, -58, 16, 15, 4);
const valveLink2 = corridor('valve.link.2', { x: 94, z: -43 }, { x: 94, z: -35 }, 3);

const pillarAt = (x: number, z: number): LocalRect => rect(x - 0.7, z - 0.7, x + 0.7, z + 0.7);

/** Low lava pools along the arena's north, south and east walls (never the entrance wall); walkable dressing, 0.2 m high. */
const lava = (id: string, x0: number, z0: number, x1: number, z1: number): PropDef => ({ id, rect: rect(x0, z0, x1, z1), height: 0.2, walkable: true });
const a = DEEPDELVE_ARENA;
const lavaPools: PropDef[] = [
  lava('lava.n.1', a.x0 + 4, a.z0, a.x0 + 12, a.z0 + 1),
  lava('lava.n.2', a.x0 + 18, a.z0, a.x0 + 26, a.z0 + 1),
  lava('lava.s.1', a.x0 + 5, a.z1 - 1, a.x0 + 13, a.z1),
  lava('lava.s.2', a.x0 + 19, a.z1 - 1, a.x0 + 27, a.z1),
  lava('lava.e.1', a.x1 - 1, a.z0 + 5, a.x1, a.z0 + 13),
  lava('lava.e.2', a.x1 - 1, a.z0 + 17, a.x1, a.z0 + 25),
];

export const DEEPDELVE_DEF: InteriorDef = mineDef(
  'deepdelve',
  {
    rooms: [landing, lead1, stage1, lead2, stage2, approach, arena, valveRoom1, valveLink1, valveRoom2, valveLink2],
    // A little cover on each fight floor.
    pillars: [pillarAt(42, -12), pillarAt(42, -28), pillarAt(50, -20), pillarAt(92, -12), pillarAt(92, -28), pillarAt(100, -20)],
    props: [
      ...lavaPools,
      { id: 'pool.1', rect: rect(48, -54, 51, -49), height: 0.3 },
      { id: 'pool.2', rect: rect(98, -54, 101, -49), height: 0.3 },
    ],
    blockers: [{ id: DEEPDELVE_ARENA_GATE, rect: rect(148.5, -22, 150, -18), height: 4 }],
    torches: [
      ...[landing, lead1, stage1, lead2, stage2, approach, valveRoom1, valveRoom2].flatMap((r) => torchesAlong(r)),
      ...torchesAlong(arena, 3, 7),
    ],
    anchors: [
      { id: 'oldsmoke.deepdelve.lift', x: 0, z: -4, yaw: 270 },
      { id: 'oldsmoke.deepdelve.lift.up', x: -2, z: -4, yaw: 270 },
      { id: 'oldsmoke.deepdelve.lift.call', x: 2, z: -4, yaw: 270 },
      { id: 'npc-post.slagg.deepdelve', x: 4, z: -14, facing: { x: 0, z: -4 } },
      { id: 'oldsmoke.deepdelve.stage.1', x: 32, z: -20, yaw: 270 },
      { id: 'oldsmoke.deepdelve.stage.2', x: 82, z: -20, yaw: 270 },
      { id: 'oldsmoke.deepdelve.valve.room.1', x: 44, z: -47, yaw: 0 },
      { id: 'oldsmoke.deepdelve.valve.room.2', x: 94, z: -47, yaw: 0 },
      { id: 'oldsmoke.deepdelve.pool.1', x: 46, z: -51.5, facing: { x: 49.5, z: -51.5 } },
      { id: 'oldsmoke.deepdelve.pool.2', x: 96, z: -51.5, facing: { x: 99.5, z: -51.5 } },
      { id: 'oldsmoke.deepdelve.spawn.1', x: 48, z: -29, yaw: 270 },
      { id: 'oldsmoke.deepdelve.spawn.2', x: 96, z: -12, yaw: 270 },
      { id: 'oldsmoke.deepdelve.spawn.3', x: 88, z: -29, yaw: 270 },
      // The Slagmaw's arena, as the boss thread asked.
      { id: 'deepdelve.slagmaw.arena.door', x: 145, z: -20, yaw: 270 },
      { id: 'deepdelve.slagmaw.arena.gate', x: 149.25, z: -20, yaw: 270 },
      { id: 'deepdelve.slagmaw.arena.centre', x: DEEPDELVE_ARENA_CENTRE.x, z: DEEPDELVE_ARENA_CENTRE.z, yaw: 270 },
      { id: 'deepdelve.slagmaw.valve.1', x: 165, z: -30, facing: DEEPDELVE_ARENA_CENTRE },
      { id: 'deepdelve.slagmaw.valve.2', x: 175, z: -10, facing: DEEPDELVE_ARENA_CENTRE },
      { id: 'deepdelve.slagmaw.valve.3', x: 155, z: -9, facing: DEEPDELVE_ARENA_CENTRE },
    ],
    triggers: [
      { id: 'trg.deepdelve.stage.1', center: { x: 32, y: 2, z: -20 }, half: { x: 3, y: 2, z: 3 } },
      { id: 'trg.deepdelve.stage.2', center: { x: 82, y: 2, z: -20 }, half: { x: 3, y: 2, z: 3 } },
      // The entrance zone just inside the arena; the door anchor is 4 m outside it.
      { id: DEEPDELVE_ARENA_TRIGGER, center: { x: 154, y: 3, z: -20 }, half: { x: 3.5, y: 3, z: 8 } },
    ],
  },
  0.6,
);

export const DEEPDELVE_STRINGS_EN: Record<string, string> = {
  [`interior.enter.${MINE_IDS.deepdelve}`]: '{key} Enter Deepdelve',
  [`interior.exit.${MINE_IDS.deepdelve}`]: '{key} Ride up to the surface',
};
