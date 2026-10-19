// The Dead Road beyond the fog wall (slice 2 thread 4, phase B): two Footman camps, the farm-ring and the South Gate.
// Engine metres, +Z north, headings stored as yaw = heading + 180 as in corridor.layout.ts. These sites stand on
// shaped ground (thread 11's terrain shaping), so they live in their own layout: core's phase A height regression
// walks every anchor of BRIGHTWATER_LAYOUT and asserts it sits on natural ground. This table is never spread into it.
// Prefixes: `deadroad.` / `farmring.` / `chest.deadroad.`; `waystone.*`, `npc-post.*` and `spawn.*` keep their contract names.
import type { AnchorSpec, LayoutData, StructureSpec } from './layoutTypes';

const a = (id: string, x: number, z: number, heading: number, tags: string[] = [], rest: Partial<AnchorSpec> = {}): AnchorSpec => ({
  id,
  x,
  z,
  yawDeg: (heading + 180) % 360,
  tags,
  ...rest,
});

/** Camp centres, 40 m off the road's north verge. Camp 1 is in the Brightwater box, camp 2 too; both are far west of the null corridor. */
export const CAMP_1 = { x: 3650, z: 692 } as const;
export const CAMP_2 = { x: 4800, z: 848 } as const;

/** The South Gate stand point (the waystone stone stands 1.8 m north of it) and the wall the city ring starts at. */
export const SOUTH_GATE = { x: 8516, z: 1212 } as const;
export const CITY_CENTRE = { x: 8500, z: 2000 } as const;
/** Nothing of phase B stands within this distance of the city centre (the ring wall is thread 17's). */
export const WALL_CLEARANCE = 752;

const campAnchors = (n: 1 | 2, c: { x: number; z: number }): AnchorSpec[] => [
  a(`deadroad.camp-${n}`, c.x, c.z, 180, ['poi']),
  a(`spawn.deadroad.camp-${n}.1`, c.x - 7, c.z - 3, 180, ['spawn']),
  a(`spawn.deadroad.camp-${n}.2`, c.x, c.z + 6, 180, ['spawn']),
  a(`spawn.deadroad.camp-${n}.3`, c.x + 7, c.z - 3, 180, ['spawn']),
  a(`chest.deadroad.camp-${n}`, c.x + 5, c.z + 11, 180, ['chest']),
];

const campStructures = (n: 1 | 2, c: { x: number; z: number }): StructureSpec[] => [
  { id: `deadroad-camp-${n}-tent-a`, kind: 'cart', x: c.x - 13, z: c.z + 9, yawDeg: 20, footprint: [3.4, 2.6], mode: 'open' },
  { id: `deadroad-camp-${n}-tent-b`, kind: 'cart', x: c.x + 13, z: c.z + 9, yawDeg: 340, footprint: [3.4, 2.6], mode: 'open' },
  { id: `deadroad-camp-${n}-fire`, kind: 'pole', x: c.x, z: c.z, yawDeg: 0, footprint: [0.7, 0.7], mode: 'open' },
];

const anchors: AnchorSpec[] = [
  ...campAnchors(1, CAMP_1),
  ...campAnchors(2, CAMP_2),

  // The farm-ring: the plateau at x 6700..6950, z 680..880 (src/terrain/shape/deadRoad.ts). The road crosses its south half.
  a('farmring.centre', 6825, 810, 0, ['poi']),
  a('waystone.farm-ring', 6830, 792, 0, ['waystone']),

  // The South Gate, outside the ring wall: the waystone and Gaut's M06 wait (Tobb's post, npc-post.tobb.south-gate, is thread 17's, just inside the gate). The road ends at (8500, 1250).
  a('waystone.harrowmark-gate', SOUTH_GATE.x, SOUTH_GATE.z, 0, ['waystone']),
  a('npc-post.gaut.south-gate', SOUTH_GATE.x + 8, SOUTH_GATE.z + 2, 270, ['npc-post']),
];

const structures: StructureSpec[] = [
  ...campStructures(1, CAMP_1),
  ...campStructures(2, CAMP_2),

  // Farmhouses, a yard fence and the stone, all on the flat plateau and east of x 6500 (inside Harrowmark's box).
  { id: 'farmring-house-1', kind: 'house', x: 6808, z: 835, yawDeg: 0, footprint: [8, 6], mode: 'solid', height: 4 },
  { id: 'farmring-house-2', kind: 'house', x: 6890, z: 850, yawDeg: 0, footprint: [8, 6], mode: 'solid', height: 4 },
  { id: 'farmring-yard-fence', kind: 'yard-fence', x: 6825, z: 868, yawDeg: 0, footprint: [60, 0.6], mode: 'solid', height: 1.6 },
  { id: 'waystone-farm-ring', kind: 'waystone', x: 6830, z: 793.8, yawDeg: 0, footprint: [1.6, 1.6], mode: 'solid', height: 2.4 },
  { id: 'waystone-harrowmark-gate', kind: 'waystone', x: SOUTH_GATE.x, z: SOUTH_GATE.z + 1.8, yawDeg: 0, footprint: [1.6, 1.6], mode: 'solid', height: 2.4 },
];

/** Title and source of the Dead Road's anchor doc, shared by the generator and the drift test. */
export const DEADROAD_DOC = { title: 'Dead Road anchors, triggers and structures (phase B)', source: 'deadroad.layout.ts' } as const;

export const DEADROAD_LAYOUT: LayoutData = {
  anchors,
  triggers: [],
  structures,
  patrols: [],
  npcs: [],
  fields: [],
};
