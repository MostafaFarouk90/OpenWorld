// The Mirewater Deeps (D05), a dive interior and Murkjaw's arena (plans/act3-K3.md section 4, revision 2 items 5 and 6).
// Local metres from the door, yaw 0 faces -Z. Section A (the hall's pool, two sealed tunnels, the first pocket) ends in sluice
// room 1; gate 1 seals section B's first tunnel until `story.d05.sluice1`. Section B (two tunnels, the third pocket) ends in
// sluice room 2, whose dry passage to the arena is shut by gate 2 until `story.d05.sluice2`. Each sluice drops the section
// behind it to wading depth (the volume sets in `water.ts`). The arena's names are frozen for K8 (plans/act3-briefs/K8.md).
import type { InteriorDef } from '../interiors/types';
import { at, pool, POOL_DEPTH, rect, stair, SURFACE_HIGH, SWIM_Y, TUNNEL_ROOF, tunnelX, tunnelZ, wadingPool } from './interiorKit';
import { SITES } from './sites';

export const DEEPS_ID = 'greyfen-deeps';
export const DEEPS_DOOR_ID = 'greyfen-deeps';
export const DEEPS_ARENA_DOOR_ID = 'greyfen-deeps-arena';
/** K12 writes it when D05 is taken. */
export const DEEPS_LOCK_FLAG = 'story.d05.started';
/** K12 writes them at the two sluice wheels. */
export const SLUICE_FLAGS = ['story.d05.sluice1', 'story.d05.sluice2'] as const;
export const SLUICE_GATES = ['greyfen.d05.gate.1', 'greyfen.d05.gate.2'] as const;
export const ARENA_GATE = 'greyfen.d05.arena.gate';
export const ARENA_DROP = 'greyfen.d05.arena.drop';


/** The arena hall and its parts (local). */
export const ARENA = {
  hall: rect(-48, -76, -8, -36),
  island: rect(-34, -62, -22, -50),
  /** Deep channels, one water volume and one catch trigger each: north, south, west, east (under the drop). */
  channels: [rect(-44, -50, -12, -40), rect(-44, -72, -12, -62), rect(-44, -62, -34, -50), rect(-22, -62, -12, -50)],
  crossings: { n: rect(-30, -50, -26, -40), s: rect(-30, -72, -26, -62), w: rect(-44, -58, -34, -54), drop: rect(-22, -58, -12, -54) },
  pools: [rect(-33, -61, -29, -57), rect(-27, -55, -23, -51)],
} as const;

const CH = ARENA.channels;
const channelSunken = [
  // Split round the fixed crossings, which stay floor; the drop crossing is a bridge blocker over the east channel.
  { id: 'channel.n.w', rect: rect(-44, -50, -30, -40), depth: POOL_DEPTH },
  { id: 'channel.n.e', rect: rect(-26, -50, -12, -40), depth: POOL_DEPTH },
  { id: 'channel.s.w', rect: rect(-44, -72, -30, -62), depth: POOL_DEPTH },
  { id: 'channel.s.e', rect: rect(-26, -72, -12, -62), depth: POOL_DEPTH },
  { id: 'channel.w.s', rect: rect(-44, -62, -34, -58), depth: POOL_DEPTH },
  { id: 'channel.w.n', rect: rect(-44, -54, -34, -50), depth: POOL_DEPTH },
  { id: 'channel.e', rect: CH[3], depth: POOL_DEPTH },
];

export const DEEPS_DEF: InteriorDef = {
  id: DEEPS_ID,
  site: SITES.deepsDoor,
  rooms: [
    { id: 'hall', x0: -6, z0: -12, x1: 6, z1: 1.5, height: 6 },
    { id: 'tunnel-1', x0: -1.25, z0: -32, x1: 1.25, z1: -12, height: 3 },
    { id: 'cell-1', x0: -7, z0: -44, x1: 8, z1: -32, height: 6 },
    { id: 'tunnel-2', x0: 8, z0: -38.25, x1: 26, z1: -35.75, height: 3 },
    { id: 'sluice-1', x0: 26, z0: -46, x1: 40, z1: -30, height: 7 },
    { id: 'tunnel-3', x0: 32.75, z0: -64, x1: 35.25, z1: -46, height: 3 },
    { id: 'cell-3', x0: 28, z0: -76, x1: 42, z1: -64, height: 6 },
    { id: 'tunnel-4', x0: 10, z0: -69.25, x1: 28, z1: -66.75, height: 3 },
    { id: 'sluice-2', x0: -4, z0: -76, x1: 10, z1: -60, height: 7 },
    { id: 'passage', x0: -8, z0: -70, x1: -4, z1: -66, height: 4 },
    { id: 'arena', ...ARENA.hall, height: 12 },
  ],
  sunken: [
    ...stair('stair.hall', -6, '-z', 1.5, 3),
    ...stair('stair.1', -33, '-z', -5.5, -4),
    ...stair('stair.s1a', 32, '-x', -38.75, -37.25),
    ...stair('stair.s1b', -40, '-z', 32.25, 33.75),
    ...stair('stair.3', -65, '-z', 36.5, 38),
    ...stair('stair.s2', 4, '+x', -69.75, -68.25),
    pool('pool.hall', rect(-3, -12, 3, -6)),
    pool('pool.1a', rect(-3, -36, 3, -32)),
    pool('pool.1b', rect(-3, -38.5, 8, -35.5)),
    pool('pool.1bay', rect(-6, -38, -3, -33)),
    pool('pool.s1a', rect(26, -39, 32, -35)),
    pool('pool.s1b', rect(32, -46, 36, -40)),
    pool('pool.3a', rect(32, -68, 36, -64)),
    pool('pool.3b', rect(28, -70, 36, -66)),
    pool('pool.3bay', rect(36, -73, 38.5, -65)),
    pool('pool.s2', rect(4, -70, 10, -66)),
    tunnelZ('tunnel.1', -32, -12, 0),
    tunnelX('tunnel.2', 8, 26, -37),
    tunnelZ('tunnel.3', -64, -46, 34),
    tunnelX('tunnel.4', 10, 28, -68),
    ...wadingPool('arena.pool.1', ARENA.pools[0]),
    ...wadingPool('arena.pool.2', ARENA.pools[1]),
    ...channelSunken,
  ],
  pillars: [],
  props: [
    // Four spear racks against the arena walls (every class can throw at the jaw).
    { id: 'rack.1', rect: rect(-47.8, -46, -47.2, -44), height: 1.6 },
    { id: 'rack.2', rect: rect(-47.8, -68, -47.2, -66), height: 1.6 },
    { id: 'rack.3', rect: rect(-21, -75.8, -19, -75.2), height: 1.6 },
    { id: 'rack.4', rect: rect(-21, -36.8, -19, -36.2), height: 1.6 },
    { id: 'sluice-wheel.1', rect: rect(39, -33, 39.8, -31.5), height: 1.4 },
    { id: 'sluice-wheel.2', rect: rect(-3.8, -63, -3, -61.5), height: 1.4 },
    { id: 'reliquary', rect: rect(38.5, -45.5, 39.7, -44.5), height: 0.9 },
  ],
  blockers: [
    // Gate 1 seals tunnel 3 under the water (from the tunnel floor to its roof); gate 2 shuts the dry passage to the arena.
    { id: SLUICE_GATES[0], rect: rect(32.75, -47, 35.25, -46.5), base: -POOL_DEPTH, height: POOL_DEPTH + TUNNEL_ROOF, startClosed: true },
    { id: SLUICE_GATES[1], rect: rect(-5, -70, -4.5, -66), height: 3.5, startClosed: true },
    // K8 closes the arena gate for the fight.
    { id: ARENA_GATE, rect: rect(-8, -70, -7.5, -66), height: 3.5 },
    // The phase 2 crossing: a bridge from the channel floor to the walkway, built closed; K8 opens it (it drops) and closes it on reset.
    { id: ARENA_DROP, rect: ARENA.crossings.drop, base: -POOL_DEPTH, height: POOL_DEPTH, startClosed: true },
  ],
  torches: [
    { x: -5.9, y: 3, z: -8 },
    { x: 5.9, y: 3, z: -8 },
    { x: -6.9, y: 3, z: -41 },
    { x: 39.9, y: 3.5, z: -36 },
    { x: 41.9, y: 3, z: -70 },
    { x: -3.9, y: 3.5, z: -73 },
    ...[-42, -56, -70].flatMap((z) => [
      { x: -47.9, y: 5, z },
      { x: -8.1, y: 5, z },
    ]),
  ],
  anchors: [
    { id: 'greyfen.deeps.entry', x: 0, z: -1, yaw: 0 },
    { id: 'greyfen.deeps.exit', x: 0, z: 0.5, yaw: 180 },
    // D05: the pockets' ledges (where K7 saves a diver), the sluice wheels, the searches, the monk's echo.
    { id: 'greyfen.d05.pocket.1', x: -4, z: -40, facing: { x: 0, z: -34.5 } },
    { id: 'greyfen.d05.pocket.2', x: 34, z: -37, facing: { x: 27, z: -37 } },
    { id: 'greyfen.d05.pocket.3', x: 40, z: -66, facing: { x: 34, z: -66 } },
    { id: 'greyfen.d05.pocket.4', x: 2, z: -68, facing: { x: 9, z: -68 } },
    { id: 'greyfen.d05.sluice.1', x: 38.2, z: -32.2, facing: { x: 39.4, z: -32.2 } },
    { id: 'greyfen.d05.sluice.2', x: -1.8, z: -62.2, facing: { x: -3.4, z: -62.2 } },
    { id: 'greyfen.d05.search.1', x: -6.5, z: -42.5, yaw: 90 },
    { id: 'greyfen.d05.search.2', x: 38, z: -44.5, facing: { x: 39, z: -45 } },
    { id: 'greyfen.d05.search.3', x: 40.5, z: -74.5, yaw: 0 },
    { id: 'greyfen.d05.search.4', x: -46, z: -38, yaw: 0 },
    { id: 'npc-post.monk-echo.deeps', x: 36.5, z: -32.5, facing: { x: 27, z: -37 } },
    { id: 'greyfen.d05.echo', x: 36.5, z: -32.5, facing: { x: 27, z: -37 } },
    // Leeches and shamblers on the ledges, never in the water, at least 25 m from both exits.
    { id: 'greyfen.spawn.d05.cell-1.1', x: -6.5, z: -43, yaw: 0 },
    { id: 'greyfen.spawn.d05.cell-1.2', x: 6.5, z: -43, yaw: 0 },
    { id: 'greyfen.spawn.d05.cell-1.3', x: -6.5, z: -32.5, yaw: 180 },
    { id: 'greyfen.spawn.d05.sluice-1.1', x: 38.5, z: -42, yaw: 0 },
    { id: 'greyfen.spawn.d05.sluice-1.2', x: 29, z: -44.5, yaw: 0 },
    { id: 'greyfen.spawn.d05.sluice-1.3', x: 38.5, z: -38.5, yaw: 0 },
    { id: 'greyfen.spawn.d05.cell-3.1', x: 40.5, z: -75, yaw: 0 },
    { id: 'greyfen.spawn.d05.cell-3.2', x: 30, z: -75, yaw: 0 },
    { id: 'greyfen.spawn.d05.cell-3.3', x: 40.5, z: -71.5, yaw: 0 },
    { id: 'greyfen.spawn.d05.sluice-2.1', x: -2.5, z: -75, yaw: 0 },
    { id: 'greyfen.spawn.d05.sluice-2.2', x: -2.5, z: -71, yaw: 0 },
    { id: 'greyfen.spawn.d05.sluice-2.3', x: 8.5, z: -61, yaw: 0 },
    // Murkjaw's arena (frozen names, K8).
    { id: 'greyfen.d05.arena.centre', x: -28, z: -56, yaw: 180 },
    { id: 'greyfen.d05.arena.door', x: -10, z: -68, facing: { x: -28, z: -56 } },
    { id: 'greyfen.d05.arena.player', x: -10, z: -62, facing: { x: -28, z: -56 } },
    { id: 'greyfen.d05.arena.rack.1', x: -46, z: -45, facing: { x: -47.5, z: -45 } },
    { id: 'greyfen.d05.arena.rack.2', x: -46, z: -67, facing: { x: -47.5, z: -67 } },
    { id: 'greyfen.d05.arena.rack.3', x: -20, z: -74, facing: { x: -20, z: -75.5 } },
    { id: 'greyfen.d05.arena.rack.4', x: -20, z: -38, facing: { x: -20, z: -36.5 } },
    ...[
      [-37, -45],
      [-19, -45],
      [-37, -67],
      [-19, -67],
      [-39, -52],
      [-17, -60],
    ].map(([x, z], i) => ({ id: `greyfen.d05.arena.surface.${i + 1}`, x: x!, z: z!, facing: { x: -28, z: -56 } })),
    ...[
      [-37, -38.5],
      [-19, -38.5],
      [-37, -73.5],
      [-19, -73.5],
      [-33.5, -52],
      [-22.5, -60.5],
    ].map(([x, z], i) => ({ id: `greyfen.d05.arena.beach.${i + 1}`, x: x!, z: z!, facing: { x: -28, z: -56 } })),
    ...[
      [-46, -38],
      [-10, -38],
      [-46, -74],
      [-10, -74],
      [-28, -56],
      [-28, -45],
      [-28, -67],
      [-39, -56],
    ].map(([x, z], i) => ({ id: `greyfen.d05.arena.walkway.${i + 1}`, x: x!, z: z!, facing: { x: -28, z: -56 } })),
    { id: 'greyfen.d05.arena.exit-inside', x: -45.5, z: -56, yaw: 270 },
    { id: 'greyfen.d05.arena.exit', x: -47, z: -56, yaw: 90 },
  ],
  triggers: [
    { id: 'trg.greyfen.d05.arena', center: { x: -28, y: 4, z: -56 }, half: { x: 20, y: 4.5, z: 20 } },
    ...CH.map((r, i) => ({
      id: `trg.greyfen.d05.channel.${i + 1}`,
      center: { x: (r.x0 + r.x1) / 2, y: -POOL_DEPTH / 2 - 0.3, z: (r.z0 + r.z1) / 2 },
      half: { x: (r.x1 - r.x0) / 2, y: POOL_DEPTH / 2 - 0.3, z: (r.z1 - r.z0) / 2 },
    })),
  ],
  doors: [
    { doorId: DEEPS_DOOR_ID, outside: 'greyfen.deeps.door', inside: 'greyfen.deeps.entry', exit: 'greyfen.deeps.exit' },
    {
      doorId: DEEPS_ARENA_DOOR_ID,
      outside: 'greyfen.deeps.arena-exit',
      inside: 'greyfen.d05.arena.exit-inside',
      exit: 'greyfen.d05.arena.exit',
      outsideInteractable: false,
    },
  ],
  environment: {
    fogColor: 0x0b120f,
    fogNear: 8,
    fogFar: 60,
    skyColor: 0x5f7a6a,
    groundColor: 0x0f1612,
    ambientIntensity: 0.4,
    lightColor: 0xa8e0c0,
    lightIntensity: 11,
    lightDistance: 20,
  },
};

/** Section A: the hall's pool to sluice room 1 (active until sluice 1). */
export const DEEPS_ROUTE_A_LOCAL = {
  id: 'dive.greyfen.d05.a',
  entryStand: at(0, 0, -3),
  points: [
    at(0, SURFACE_HIGH, -9),
    at(0, SWIM_Y, -11.5),
    at(0, SWIM_Y, -32.5),
    at(0, SURFACE_HIGH, -34.5),
    at(0, SWIM_Y, -36),
    at(1.5, SWIM_Y, -37),
    at(8.5, SWIM_Y, -37),
    at(25.5, SWIM_Y, -37),
    at(27, SURFACE_HIGH, -37),
  ],
  airPockets: [
    { id: 'greyfen.d05.pocket.1', at: at(0, SURFACE_HIGH, -34.5), stand: at(-4, 0, -40) },
    { id: 'greyfen.d05.pocket.2', at: at(27, SURFACE_HIGH, -37), stand: at(34, 0, -37) },
  ],
} as const;

/** Section B: sluice room 1's second pool to sluice room 2 (behind gate 1 until sluice 1, wading after sluice 2). */
export const DEEPS_ROUTE_B_LOCAL = {
  id: 'dive.greyfen.d05.b',
  entryStand: at(35.5, 0, -38.5),
  points: [
    at(34, SURFACE_HIGH, -42),
    at(34, SWIM_Y, -45.5),
    at(34, SWIM_Y, -64.5),
    at(34, SURFACE_HIGH, -66),
    at(33, SWIM_Y, -68),
    at(27.5, SWIM_Y, -68),
    at(10.5, SWIM_Y, -68),
    at(9.2, SURFACE_HIGH, -68),
  ],
  airPockets: [
    { id: 'greyfen.d05.pocket.3', at: at(34, SURFACE_HIGH, -66), stand: at(40, 0, -66) },
    { id: 'greyfen.d05.pocket.4', at: at(9.2, SURFACE_HIGH, -68), stand: at(2, 0, -68) },
  ],
} as const;

/** Section A's water: a local box over the hall pool, tunnels 1 and 2, cell 1 and sluice room 1's first pool. */
export const DEEPS_WATER_A_LOCAL = rect(-7, -39, 32, -6);
/** Section B's water: departure pool, tunnel 3, cell 3, tunnel 4 and sluice room 2's pool (local polygon). */
export const DEEPS_WATER_B_LOCAL: readonly (readonly [number, number])[] = [
  [31.5, -39.5],
  [36.5, -39.5],
  [36.5, -63.5],
  [39, -63.5],
  [39, -73.5],
  [27.5, -73.5],
  [27.5, -70.5],
  [3.5, -70.5],
  [3.5, -65.5],
  [27.5, -65.5],
  [27.5, -63.5],
  [31.5, -63.5],
];

export const DEEPS_STRINGS_EN: Record<string, string> = {
  [`interior.enter.${DEEPS_DOOR_ID}`]: '{key} Enter the Mirewater Deeps',
  [`interior.exit.${DEEPS_DOOR_ID}`]: '{key} Leave the Deeps',
  [`interior.exit.${DEEPS_ARENA_DOOR_ID}`]: '{key} Climb out through the broken wall',
};
