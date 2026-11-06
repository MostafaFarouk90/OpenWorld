// The Crucible Cellars (Act 4, L2; plans/act4-L2.md section 5.3), greybox: Vey's secret crucible under the Keep, D07. Entered
// from a new door at the old Smelter gate, not through D02's lattice (its hash is pinned). Local metres from the door; the
// cellars run along +Z: the entry, vat hall 1, the cradle gallery (east), vat hall 2, the forge (west) and the Bellows-Engine
// arena behind its gate. L6 builds the engine and the valves' behaviour on the sites named here.
import { ACT4_SITES, CRUCIBLE_DOOR, CRUCIBLE_ID } from '../../../harrowmark/act4/sites';
import type { InteriorDef, LocalRect } from '../../types';

export { CRUCIBLE_ID };
export const CRUCIBLE_DOOR_ID = 'crucible-cellars';
/** L10 writes it when Rook gives D07; the door refuses before it ("Rook has the key."). */
export const CRUCIBLE_LOCK_FLAG = 'story.d07.started';
/** The arena's gate, built closed; it opens on L10's flag once the three vat-hall valves are turned (L6 may drive it). */
export const CRUCIBLE_ARENA_GATE = 'crucible.arena.gate';
export const CRUCIBLE_ARENA_GATE_FLAG = 'story.d07.vatValves';

const P = 'harrowmark.a4.crucible';
const rect = (x0: number, z0: number, x1: number, z1: number): LocalRect => ({ x0, z0, x1, z1 });
/** A dragon-heart cradle (round in the art, a square solid here) of half size `h` at (x, z). */
const cradle = (id: string, x: number, z: number, h = 1.5) => ({ id, rect: rect(x - h, z - h, x + h, z + h), height: 1.2 });

/** The arena's floor (local). */
export const CRUCIBLE_ARENA = rect(-15, 46, 15, 70);
/** L6's four valve sites, one per arena wall: west, east, north, south-east. */
export const CRUCIBLE_VALVES = [
  { n: 1, x: -14, z: 58, yaw: 270 },
  { n: 2, x: 14, z: 58, yaw: 90 },
  { n: 3, x: 0, z: 69, yaw: 180 },
  { n: 4, x: 9, z: 47, yaw: 0 },
] as const;

export const CRUCIBLE_DEF: InteriorDef = {
  id: CRUCIBLE_ID,
  site: { ...ACT4_SITES[CRUCIBLE_ID] },
  rooms: [
    { id: 'entry', x0: -3, z0: -1.5, x1: 3, z1: 6, height: 4 },
    { id: 'passage-1', x0: -1.5, z0: 6, x1: 1.5, z1: 10, height: 4 },
    { id: 'vat-1', x0: -12, z0: 10, x1: 12, z1: 24, height: 7 },
    { id: 'passage-east', x0: 12, z0: 15, x1: 16, z1: 19, height: 4 },
    { id: 'cradles', x0: 16, z0: 8, x1: 34, z1: 26, height: 6 },
    { id: 'passage-2', x0: -1.5, z0: 24, x1: 1.5, z1: 28, height: 4 },
    { id: 'vat-2', x0: -12, z0: 28, x1: 12, z1: 42, height: 7 },
    { id: 'forge', x0: -26, z0: 30, x1: -12, z1: 40, height: 6 },
    { id: 'arena-mouth', x0: -2, z0: 42, x1: 2, z1: 46, height: 5 },
    { id: 'arena', ...CRUCIBLE_ARENA, height: 9 },
  ],
  pillars: [rect(-8, 16.5, -7, 17.5), rect(7, 16.5, 8, 17.5), rect(-8, 34.5, -7, 35.5), rect(7, 34.5, 8, 35.5)],
  props: [
    // Vats (round copper tubs) in the halls, the cradles in the gallery.
    cradle('vat.1a', -5, 20, 2),
    cradle('vat.1b', 4, 13, 2),
    cradle('vat.2a', -5, 38, 2),
    cradle('vat.2b', 5, 31, 2),
    ...[0, 1, 2].flatMap((i) => [cradle(`cradle.n${i}`, 20 + i * 6, 22), cradle(`cradle.s${i}`, 20 + i * 6, 12)]),
    // The forge: a furnace and the ledger lectern.
    { id: 'furnace', rect: rect(-25.5, 34, -22, 39.5), height: 2.6 },
    { id: 'lectern', rect: rect(-18.4, 30.4, -17.6, 31.2), height: 1.1 },
  ],
  blockers: [{ id: CRUCIBLE_ARENA_GATE, rect: rect(-2, 45.5, 2, 46), height: 5, startClosed: true }],
  torches: [
    { x: -2.9, y: 2.2, z: 3 },
    { x: 2.9, y: 2.2, z: 3 },
    ...[14, 20].flatMap((z) => [
      { x: -11.9, y: 3, z },
      { x: 11.9, y: 3, z },
    ]),
    ...[32, 38].flatMap((z) => [
      { x: -11.9, y: 3, z },
      { x: 11.9, y: 3, z },
    ]),
    { x: 33.9, y: 3, z: 12 },
    { x: 33.9, y: 3, z: 22 },
    { x: -14, y: 3, z: 39.9 },
    ...[50, 58, 66].flatMap((z) => [
      { x: -14.9, y: 4, z },
      { x: 14.9, y: 4, z },
    ]),
  ],
  anchors: [
    { id: `${P}.entry`, x: 0, z: 2, yaw: 180 },
    { id: `${P}.exit`, x: 0, z: -0.8, yaw: 0 },
    { id: `${P}.rook`, x: 2, z: 4, facing: { x: 0, z: 10 } },
    { id: `${P}.captive`, x: -21, z: 31.5, facing: { x: -18, z: 35 } },
    // The vat-hall puzzle (D07's interact and search beats).
    { id: `${P}.vatvalve.1`, x: -11, z: 12, yaw: 270 },
    { id: `${P}.vatvalve.2`, x: 33, z: 17, yaw: 90 },
    { id: `${P}.vatvalve.3`, x: 11, z: 40, yaw: 90 },
    { id: `${P}.cradle-stamp`, x: 26, z: 19.5, yaw: 0 },
    { id: `${P}.ledgers`, x: -18, z: 32, facing: { x: -18, z: 30.8 } },
    { id: `${P}.furnace-log`, x: -21, z: 38.5, facing: { x: -22, z: 38.5 } },
    { id: `${P}.carter-tally`, x: 9, z: 22, yaw: 0 },
    // Spawner members (d07.vat-1, d07.cradles, d07.vat-2, d07.forge), three each.
    ...[1, 2, 3].map((n) => ({ id: `${P}.spawn.vat-1.${n}`, x: -4 + n * 2, z: 16, yaw: 180 })),
    ...[1, 2, 3].map((n) => ({ id: `${P}.spawn.cradles.${n}`, x: 17 + n * 4, z: 17, yaw: 270 })),
    ...[1, 2, 3].map((n) => ({ id: `${P}.spawn.vat-2.${n}`, x: -4 + n * 2, z: 34, yaw: 180 })),
    ...[1, 2, 3].map((n) => ({ id: `${P}.spawn.forge.${n}`, x: -20 + n * 2, z: 36, yaw: 90 })),
    // The arena (L6): the engine, the valve sites, the coal chutes, the gate's inside and the arena lights.
    { id: `${P}.arena.engine`, x: 0, z: 62, yaw: 0 },
    { id: `${P}.arena.entry`, x: 0, z: 48, yaw: 180 },
    ...CRUCIBLE_VALVES.map((v) => ({ id: `${P}.valve.${v.n}`, x: v.x, z: v.z, yaw: v.yaw })),
    ...[-12, 0, 12].map((x, i) => ({ id: `${P}.arena.chute.${i + 1}`, x, z: 67, yaw: 0 })),
    ...[-10, 10].map((x, i) => ({ id: `${P}.arena.light.${i + 1}`, x, z: 58, yaw: 0 })),
  ],
  triggers: [
    { id: 'trg.harrowmark.a4.crucible.arena', center: { x: 0, y: 2, z: 58 }, half: { x: 15, y: 2, z: 12 } },
    ...CRUCIBLE_VALVES.map((v) => ({ id: `trg.harrowmark.a4.crucible.valve.${v.n}`, center: { x: v.x, y: 1, z: v.z }, half: { x: 1, y: 1, z: 1 } })),
  ],
  doors: [{ doorId: CRUCIBLE_DOOR_ID, outside: CRUCIBLE_DOOR.anchor, inside: `${P}.entry`, exit: `${P}.exit` }],
  environment: {
    fogColor: 0x140806,
    fogNear: 10,
    fogFar: 50,
    skyColor: 0x8a5a40,
    groundColor: 0x1a0c08,
    ambientIntensity: 0.5,
    lightColor: 0xff9a5a,
    lightIntensity: 13,
    lightDistance: 18,
  },
};
