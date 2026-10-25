// The Sunken Chapel (R13), a dive interior (plans/act3-K3.md section 4). Local metres from the door, yaw 0 faces -Z. The dry
// porch (the bell keeper, the font pool) leads by four sealed nave tunnels and three pocket chambers to the altar chamber,
// which has an exit-only door up the drowned bell tower. Water is registered by `water.ts` on K7's service.
import type { InteriorDef } from '../interiors/types';
import { at, pool, rect, stair, SURFACE_HIGH, SWIM_Y, tunnelZ, tunnelX } from './interiorKit';
import { SITES } from './sites';

export const CHAPEL_ID = 'greyfen-chapel';
export const CHAPEL_DOOR_ID = 'greyfen-chapel';
export const CHAPEL_TOWER_DOOR_ID = 'greyfen-chapel-tower';
/** K12 writes it when R13 is taken. */
export const CHAPEL_LOCK_FLAG = 'story.r13.started';


export const CHAPEL_DEF: InteriorDef = {
  id: CHAPEL_ID,
  site: SITES.chapelDoor,
  rooms: [
    { id: 'porch', x0: -6, z0: -10, x1: 6, z1: 1.5, height: 6 },
    { id: 'nave-1', x0: -1.25, z0: -28, x1: 1.25, z1: -10, height: 3 },
    { id: 'chapel-1', x0: -8, z0: -38, x1: 6, z1: -28, height: 6 },
    { id: 'nave-2', x0: 6, z0: -34.25, x1: 26, z1: -31.75, height: 3 },
    { id: 'chapel-2', x0: 26, z0: -38, x1: 40, z1: -28, height: 6 },
    { id: 'nave-3', x0: 30.75, z0: -28, x1: 33.25, z1: -10, height: 3 },
    { id: 'chapel-3', x0: 26, z0: -10, x1: 40, z1: 0, height: 6 },
    { id: 'nave-4', x0: 30.75, z0: 0, x1: 33.25, z1: 18, height: 3 },
    { id: 'altar', x0: 24, z0: 18, x1: 40, z1: 30, height: 8 },
  ],
  sunken: [
    // Stairs first: the first entry that contains a cell wins.
    ...stair('stair.porch', -4, '-z', 1.5, 3),
    ...stair('stair.1', -29, '-z', -6, -4.5),
    ...stair('stair.2', -29, '-z', 36, 37.5),
    ...stair('stair.3', -1, '-z', 35.5, 37),
    ...stair('stair.altar', 24, '-z', 35.5, 37),
    pool('pool.porch', rect(-3, -10, 3, -4)),
    pool('pool.1a', rect(-3, -34, 3, -28)),
    pool('pool.1b', rect(-3, -35, 6, -31)),
    pool('pool.1bay', rect(-6.5, -34, -3, -29)),
    pool('pool.2a', rect(26, -35, 35, -31)),
    pool('pool.2b', rect(29, -31, 35, -28)),
    pool('pool.2bay', rect(35, -35, 38, -29)),
    pool('pool.3', rect(29, -10, 35, 0)),
    pool('pool.3bay', rect(35, -9, 37.5, -1)),
    pool('pool.altar', rect(29, 18, 35, 24)),
    pool('pool.altarbay', rect(35, 19, 37.5, 24)),
    tunnelZ('nave.1', -28, -10, 0),
    tunnelX('nave.2', 6, 26, -33),
    tunnelZ('nave.3', -28, -10, 32),
    tunnelZ('nave.4', 0, 18, 32),
  ],
  pillars: [],
  props: [
    { id: 'altar', rect: rect(30, 27, 34, 28.5), height: 1 },
    { id: 'hymn-board', rect: rect(-5.8, -3, -5.4, -1), height: 1.6 },
    { id: 'bell-rope', rect: rect(38.5, -9.5, 39, -9), height: 2.4 },
    { id: 'ledger', rect: rect(24.4, 19.5, 25.4, 21), height: 0.9 },
  ],
  blockers: [],
  torches: [
    { x: -5.9, y: 3, z: -6 },
    { x: 5.9, y: 3, z: -6 },
    { x: -7.9, y: 3, z: -36 },
    { x: 39.9, y: 3, z: -32 },
    { x: 39.9, y: 3, z: -6 },
    { x: 24.1, y: 4, z: 26 },
    { x: 39.9, y: 4, z: 26 },
  ],
  anchors: [
    { id: 'greyfen.chapel.entry', x: 0, z: -1, yaw: 0 },
    { id: 'greyfen.chapel.exit', x: 0, z: 0.5, yaw: 180 },
    { id: 'greyfen.chapel.tower.inside', x: 38, z: 27, facing: { x: 32, z: 27 } },
    { id: 'greyfen.chapel.tower.exit', x: 39.2, z: 29.2, yaw: 180 },
    { id: 'npc-post.bell-keeper.chapel', x: -4.5, z: -8, facing: { x: 0, z: -7 } },
    // R13: the altar (the song), the three pockets' ledges, the five searches.
    { id: 'greyfen.r13.altar', x: 32, z: 26, facing: { x: 32, z: 28 } },
    { id: 'greyfen.r13.pocket.1', x: -1.75, z: -36.5, facing: { x: 0, z: -31 } },
    { id: 'greyfen.r13.pocket.2', x: 38.8, z: -33, facing: { x: 32, z: -31 } },
    { id: 'greyfen.r13.pocket.3', x: 38.8, z: -3, facing: { x: 32, z: -5 } },
    { id: 'greyfen.r13.search.1', x: -4.6, z: -2, facing: { x: -5.6, z: -2 } },
    { id: 'greyfen.r13.search.2', x: 4.5, z: -3, facing: { x: 0, z: -7 } },
    { id: 'greyfen.r13.search.3', x: 38, z: -8.5, facing: { x: 38.75, z: -9.25 } },
    { id: 'greyfen.r13.search.4', x: 26, z: 28, facing: { x: 30, z: 27.5 } },
    { id: 'greyfen.r13.search.5', x: 26.2, z: 20.2, facing: { x: 25, z: 20.2 } },
    // Leeches on the pocket ledges, never in the water and at least 25 m from both exits.
    { id: 'greyfen.spawn.r13.nave.1', x: -4.5, z: -37, yaw: 0 },
    { id: 'greyfen.spawn.r13.nave.2', x: 4.5, z: -37, yaw: 0 },
    { id: 'greyfen.spawn.r13.nave.3', x: 39, z: -37, yaw: 0 },
    { id: 'greyfen.spawn.r13.nave.4', x: 27, z: -8, yaw: 0 },
    { id: 'greyfen.spawn.r13.nave.5', x: 27, z: -2, yaw: 0 },
  ],
  triggers: [{ id: 'trg.greyfen.r13.altar', center: { x: 32, y: 2, z: 26 }, half: { x: 8, y: 3, z: 4 } }],
  doors: [
    { doorId: CHAPEL_DOOR_ID, outside: 'greyfen.chapel.door', inside: 'greyfen.chapel.entry', exit: 'greyfen.chapel.exit' },
    {
      doorId: CHAPEL_TOWER_DOOR_ID,
      outside: 'greyfen.chapel.tower-exit',
      inside: 'greyfen.chapel.tower.inside',
      exit: 'greyfen.chapel.tower.exit',
      outsideInteractable: false,
    },
  ],
  environment: {
    fogColor: 0x0e1612,
    fogNear: 8,
    fogFar: 55,
    skyColor: 0x6f8a7e,
    groundColor: 0x121a16,
    ambientIntensity: 0.45,
    lightColor: 0xbfe8d0,
    lightIntensity: 10,
    lightDistance: 18,
  },
};

/** The nave dive (local points; `water.ts` moves it to world space). Pockets in order; `stand` is the ledge K7 saves. */
export const CHAPEL_ROUTE_LOCAL = {
  id: 'dive.greyfen.r13.nave',
  entryStand: at(0, 0, -2.5),
  points: [
    at(0, SURFACE_HIGH, -7),
    at(0, SWIM_Y, -9.5),
    at(0, SWIM_Y, -28.5),
    at(0, SURFACE_HIGH, -31),
    at(0, SWIM_Y, -31.5),
    at(1, SWIM_Y, -33),
    at(6.5, SWIM_Y, -33),
    at(25.5, SWIM_Y, -33),
    at(28, SWIM_Y, -33),
    at(33, SURFACE_HIGH, -32),
    at(32, SWIM_Y, -30),
    at(32, SWIM_Y, -27.5),
    at(32, SWIM_Y, -10.5),
    at(32, SURFACE_HIGH, -6),
    at(32, SWIM_Y, -0.5),
    at(32, SWIM_Y, 18.5),
    at(32, SURFACE_HIGH, 21),
  ],
  airPockets: [
    { id: 'greyfen.r13.pocket.1', at: at(0, SURFACE_HIGH, -31), stand: at(-1.75, 0, -36.5) },
    { id: 'greyfen.r13.pocket.2', at: at(33, SURFACE_HIGH, -32), stand: at(38.8, 0, -33) },
    { id: 'greyfen.r13.pocket.3', at: at(32, SURFACE_HIGH, -6), stand: at(38.8, 0, -3) },
    { id: 'greyfen.r13.altar', at: at(32, SURFACE_HIGH, 21), stand: at(32, 0, 26) },
  ],
} as const;

/** The chapel's one dive volume (all pools and naves), local box. */
export const CHAPEL_WATER_LOCAL = rect(-6.5, -38, 40, 30);

export const CHAPEL_STRINGS_EN: Record<string, string> = {
  [`interior.enter.${CHAPEL_DOOR_ID}`]: '{key} Enter the Sunken Chapel',
  [`interior.exit.${CHAPEL_DOOR_ID}`]: '{key} Leave the chapel',
  [`interior.exit.${CHAPEL_TOWER_DOOR_ID}`]: '{key} Climb the bell tower',
};
