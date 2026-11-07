// The Foundry Descent (Act 5 N2, D09), greybox: three floors in one interior (local y 0, -6, -12), the Keep stairs pattern. Floor 1
// the slag foundry (the slag-flow puzzle), a gated lift stairwell, floor 2 the vat gallery, stairs, floor 3 Vey's ring arena and
// the foot with the link to the Hammer Hall. Local metres from the door, rooms run +Z. Stair-flagged sunken cells cannot carry a
// roof, so a floor's headroom is its room height plus its depth: floor 1 is 9 m, floor 2 is 3 + 6, floor 3 is 2 + 12.
import { LINK_ONLY_EXIT } from '../../harrowmark/act4/sites';
import type { InteriorDef, LocalRect, PropDef, SunkenDef } from '../../interiors/types';
import { BLOCKERS, CALDERA_INTERIOR_SITES, DOOR_FOUNDRY, FOUNDRY_ARENA, FOUNDRY_DOOR_ID, FOUNDRY_DESCENT_ID, FOUNDRY_FOOT_DOOR_ID, FOUNDRY_RUNNELS, INT_ANCHOR, INT_TRIGGER, rectOf as rect } from './sites';

const P = `${INT_ANCHOR}.foundry`;
const T = `${INT_TRIGGER}.foundry`;
export const FOUNDRY_LINK_ANCHOR = `${P}.link.hammer`;
export const FOUNDRY_CHEST_ANCHOR = `${P}.chest`;
/** Local z of the entry anchor, and of the exit gate across the passage (the plugin's foot check). */
export const FOUNDRY_ENTRY_Z = 2;
export const FOUNDRY_EXIT_GATE_Z = 166;
export const FOUNDRY_CHEST_ID = 'chest:foundry-cache';
const STEP = 0.3;
const r2 = (n: number) => Math.round(n * 100) / 100;

/** `n` steps of 0.3 m along +Z from `z0`, starting at depth `from`, across x0..x1. */
function flight(id: string, z0: number, from: number, n: number, x0 = -3, x1 = 3): SunkenDef[] {
  return Array.from({ length: n }, (_, i) => ({ id: `${id}.${i + 1}`, rect: rect(x0, z0 + i, x1, z0 + i + 1), depth: r2(from + (i + 1) * STEP), stairs: true }));
}

/** Six vats (three a side), the seven-anvil map table, three ledger lecterns and N7's chest crate. */
const GALLERY_PROPS: PropDef[] = [
  ...[72, 84, 96].flatMap((z) => [
    { id: `vat.w.${z}`, rect: rect(-18, z - 2, -14, z + 2), height: 3 },
    { id: `vat.e.${z}`, rect: rect(14, z - 2, 18, z + 2), height: 3 },
  ]),
  { id: 'map-table', rect: rect(-1.5, 70, 1.5, 72), height: 1 },
  ...[-10, 0, 10].map((x, i) => ({ id: `lectern.${i + 1}`, rect: rect(x - 0.4, 99.6, x + 0.4, 100.4), height: 1.1 })),
  { id: 'chest-crate', rect: rect(22.7, 85.5, 24, 86.5), height: 0.9 },
];

/** Vey's ring: a square curb 22 m a side about (0, 149), walkable (0.3 m), with a 4 m gap at each side's middle. */
const RING = 0.3;
const ring = (x0: number, z0: number, x1: number, z1: number, id: string): PropDef => ({ id, rect: rect(x0, z0, x1, z1), height: RING, walkable: true });
const ARENA_PROPS: PropDef[] = [
  ring(-11.3, 137.7, -2, 138.3, 'ring.n1'),
  ring(2, 137.7, 11.3, 138.3, 'ring.n2'),
  ring(-11.3, 159.7, -2, 160.3, 'ring.s1'),
  ring(2, 159.7, 11.3, 160.3, 'ring.s2'),
  ring(-11.3, 138.3, -10.7, 147, 'ring.w1'),
  ring(-11.3, 151, -10.7, 159.7, 'ring.w2'),
  ring(10.7, 138.3, 11.3, 147, 'ring.e1'),
  ring(10.7, 151, 11.3, 159.7, 'ring.e2'),
  // Six bolt-cache crates flush to the walls (the Bellows-Engine lesson).
  { id: 'cache.1', rect: rect(-15, 141, -13.8, 142.2), height: 0.9 },
  { id: 'cache.2', rect: rect(-15, 156, -13.8, 157.2), height: 0.9 },
  { id: 'cache.3', rect: rect(13.8, 141, 15, 142.2), height: 0.9 },
  { id: 'cache.4', rect: rect(13.8, 156, 15, 157.2), height: 0.9 },
  { id: 'cache.5', rect: rect(-9.6, 134, -8.4, 135.2), height: 0.9 },
  { id: 'cache.6', rect: rect(8.4, 134, 9.6, 135.2), height: 0.9 },
];
const CACHES: readonly { n: number; x: number; z: number; fx: number; fz: number }[] = [
  { n: 1, x: -12.5, z: 141.6, fx: -15, fz: 141.6 },
  { n: 2, x: -12.5, z: 156.6, fx: -15, fz: 156.6 },
  { n: 3, x: 12.5, z: 141.6, fx: 15, fz: 141.6 },
  { n: 4, x: 12.5, z: 156.6, fx: 15, fz: 156.6 },
  { n: 5, x: -9, z: 136.6, fx: -9, fz: 134 },
  { n: 6, x: 9, z: 136.6, fx: 9, fz: 134 },
];

export const FOUNDRY_DESCENT_DEF: InteriorDef = {
  id: FOUNDRY_DESCENT_ID,
  site: { ...CALDERA_INTERIOR_SITES[FOUNDRY_DESCENT_ID] },
  rooms: [
    { id: 'entry', x0: -5, z0: -1.5, x1: 5, z1: 6.5, height: 6 },
    { id: 'floor-1', x0: -20, z0: 6.5, x1: 20, z1: 40, height: 9 },
    { id: 'lift', x0: -3, z0: 40, x1: 3, z1: 64, height: 5 },
    { id: 'gallery', x0: -24, z0: 64, x1: 24, z1: 106, height: 3 },
    { id: 'stairs-2', x0: -3, z0: 106, x1: 3, z1: 134, height: 5 },
    { id: 'arena', ...FOUNDRY_ARENA, height: 2 },
    { id: 'exit-pass', x0: -3, z0: 164, x1: 3, z1: 168, height: 2 },
    { id: 'foot', x0: -6, z0: 168, x1: 6, z1: 176, height: 2 },
  ],
  pillars: [rect(-8.6, 13.4, -7.4, 14.6), rect(7.4, 13.4, 8.6, 14.6), rect(-8.6, 29.4, -7.4, 30.6), rect(7.4, 29.4, 8.6, 30.6), rect(5.4, 142.4, 6.6, 143.6), rect(-6.6, 142.4, -5.4, 143.6), rect(5.4, 154.4, 6.6, 155.6), rect(-6.6, 154.4, -5.4, 155.6)],
  props: [...GALLERY_PROPS, ...ARENA_PROPS],
  sunken: [
    // Shallow slag runnels on floor 1 (walkable look, no hazard in the geometry).
    ...FOUNDRY_RUNNELS.map((rc, i) => ({ id: `runnel.${i + 1}`, rect: rc, depth: STEP })),
    // The lift stairwell: flight 1 (z 42..52, to 3 m), a 2 m landing, flight 2 (z 54..64, to 6 m).
    ...flight('lift-1', 42, 0, 10),
    { id: 'lift-landing', rect: rect(-3, 52, 3, 54), depth: 3, stairs: true },
    ...flight('lift-2', 54, 3, 10),
    // Floor 2, the vat gallery, at 6 m.
    { id: 'gallery', rect: rect(-24, 64, 24, 106), depth: 6, stairs: true },
    // Stairs 2: 2 m head, flight (to 9 m), landing, flight (to 12 m).
    { id: 'stairs-2-head', rect: rect(-3, 106, 3, 108), depth: 6, stairs: true },
    ...flight('stairs-2a', 108, 6, 10),
    { id: 'stairs-2-landing', rect: rect(-3, 118, 3, 120), depth: 9, stairs: true },
    ...flight('stairs-2b', 120, 9, 10),
    // Floor 3, the arena, its passages and the foot, at 12 m.
    { id: 'floor-3', rect: rect(-15, 130, 15, 176), depth: 12, stairs: true },
  ],
  blockers: [
    { id: BLOCKERS.foundryLift, rect: rect(-3, 40.75, 3, 41.25), height: 5, startClosed: true },
    // The arena gate is driven by the boss arena (open by default); the exit opens on Vey's outcome (any), re-derived on a load.
    { id: BLOCKERS.foundryArenaGate, rect: rect(-3, 131.75, 3, 132.25), height: 17, base: -12 },
    { id: BLOCKERS.foundryArenaExit, rect: rect(-3, 165.75, 3, 166.25), height: 14, base: -12, startClosed: true },
  ],
  torches: [
    { x: -4.9, y: 3, z: 3 },
    { x: 4.9, y: 3, z: 3 },
    ...[12, 24, 36].flatMap((z) => [
      { x: -19.9, y: 5, z },
      { x: 19.9, y: 5, z },
    ]),
    ...[70, 84, 98].flatMap((z) => [
      { x: -23.9, y: -2, z },
      { x: 23.9, y: -2, z },
    ]),
    ...[140, 158].flatMap((z) => [
      { x: -14.9, y: -8, z },
      { x: 14.9, y: -8, z },
    ]),
    { x: -5.9, y: -8, z: 172 },
    { x: 5.9, y: -8, z: 172 },
  ],
  anchors: [
    { id: `${P}.entry`, x: 0, z: FOUNDRY_ENTRY_Z, yaw: 180 },
    { id: `${P}.exit`, x: 0, z: -0.8, yaw: 0 },
    { id: `${P}.alric`, x: 3, z: 3.5, facing: { x: 0, z: 2 } },
    // Floor 1: patrol loop, the slag puzzle (three sluices, the cooling basin at the lift head), checkpoint.
    ...[
      [-12, 10],
      [0, 10],
      [12, 10],
      [12, 24],
      [12, 36],
      [0, 34],
      [-12, 36],
      [-12, 24],
    ].map(([x, z], i) => ({ id: `${P}.patrol.${i + 1}`, x: x!, z: z!, yaw: 180 })),
    ...[12, 22, 30].map((z, i) => ({ id: `${P}.sluice.${i + 1}`, x: -18, z, facing: { x: -20, z } })),
    { id: `${P}.basin`, x: 0, z: 37, facing: { x: 0, z: 40 } },
    { id: `${P}.checkpoint.1`, x: 0, z: 9, yaw: 180 },
    // Floor 2: ledgers, the seven-anvil map, guards, patrol, Wenna's hand-over, N7's chest, checkpoint.
    ...[-10, 0, 10].map((x, i) => ({ id: `${P}.ledger.${i + 1}`, x, z: 98.6, facing: { x, z: 100 } })),
    { id: `${P}.map`, x: 0, z: 68.5, facing: { x: 0, z: 71 } },
    ...[
      [-10, 80],
      [10, 80],
      [-10, 92],
      [10, 92],
    ].map(([x, z], i) => ({ id: `${P}.guard.${i + 1}`, x: x!, z: z!, facing: { x: 0, z: 86 } })),
    ...[
      [-8, 70],
      [8, 70],
      [8, 84],
      [8, 98],
      [-8, 98],
      [-8, 84],
    ].map(([x, z], i) => ({ id: `${P}.vat.patrol.${i + 1}`, x: x!, z: z!, yaw: 180 })),
    { id: `${P}.wenna`, x: 0, z: 103, facing: { x: 0, z: 100 } },
    { id: FOUNDRY_CHEST_ANCHOR, x: 21, z: 86, facing: { x: 24, z: 86 } },
    { id: `${P}.checkpoint.2`, x: 0, z: 66, yaw: 180 },
    // Floor 3: Vey's arena (N6): entry, Vey's mark, the F7 crowd, caches, ring lights, checkpoint; the foot and the link.
    { id: `${P}.arena.entry`, x: 0, z: 136, yaw: 180 },
    { id: `${P}.arena.vey`, x: 0, z: 155, facing: { x: 0, z: 136 } },
    ...[
      [-13, 148],
      [13, 148],
      [-8, 158],
      [8, 158],
    ].map(([x, z], i) => ({ id: `${P}.arena.crowd.${i + 1}`, x: x!, z: z!, facing: { x: 0, z: 149 } })),
    ...CACHES.map((c) => ({ id: `${P}.arena.cache.${c.n}`, x: c.x, z: c.z, facing: { x: c.fx, z: c.fz } })),
    ...[-13, 13].map((x, i) => ({ id: `${P}.arena.light.${i + 1}`, x, z: 145, yaw: 0 })),
    { id: `${P}.checkpoint.3`, x: 0, z: 132.8, yaw: 180 },
    { id: `${P}.from-hammer`, x: 0, z: 170.5, yaw: 0 },
    { id: FOUNDRY_LINK_ANCHOR, x: 0, z: 173, yaw: 0 },
  ],
  triggers: [
    { id: `${T}.floor1`, center: { x: 0, y: 3, z: 23 }, half: { x: 20, y: 3, z: 17 } },
    { id: `${T}.gallery`, center: { x: 0, y: -3, z: 85 }, half: { x: 24, y: 3, z: 21 } },
    { id: `${T}.arena`, center: { x: 0, y: -10, z: 149 }, half: { x: 15, y: 4, z: 15 } },
  ],
  doors: [
    { doorId: FOUNDRY_DOOR_ID, outside: DOOR_FOUNDRY, inside: `${P}.entry`, exit: `${P}.exit` },
    // The Hammer Hall's back link lands here (link-only, no outside prompt).
    { doorId: FOUNDRY_FOOT_DOOR_ID, outside: DOOR_FOUNDRY, inside: `${P}.from-hammer`, exit: LINK_ONLY_EXIT, outsideInteractable: false },
  ],
  environment: {
    fogColor: 0x180a06,
    fogNear: 10,
    fogFar: 55,
    skyColor: 0x8a5038,
    groundColor: 0x1c0e08,
    ambientIntensity: 0.5,
    lightColor: 0xff8a48,
    lightIntensity: 14,
    lightDistance: 19,
  },
};
export type { LocalRect };
