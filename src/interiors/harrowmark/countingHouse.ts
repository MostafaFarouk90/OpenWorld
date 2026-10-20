import type { InteriorDef } from '../types';
import { HARROWMARK_SITES } from './sites';

export const COUNTING_HOUSE_ID = 'counting-house';

/** Closed loops of nodes (the last node walks back to the first). */
const HALL_LOOP = [
  { x: -11.75, z: -5.75 },
  { x: 3.75, z: -5.75 },
  { x: 3.75, z: -11.75 },
  { x: -11.75, z: -11.75 },
];
const STACKS_LOOP = [
  { x: -11.75, z: -15.75 },
  { x: -6.75, z: -15.75 },
  { x: -6.75, z: -19.25 },
  { x: -11.75, z: -19.25 },
];
const next = (loop: { x: number; z: number }[], i: number) => loop[(i + 1) % loop.length];

/**
 * The Counting House for M09's stealth section (greybox), 26 x 22 m. The door is at +Z into the entry hall; the counting hall
 * (two rows of desks, a patrol loop around them) lies behind it with the stair block and its under-stair nook to the east. The
 * stacks (shelf rows, a patrol loop in the west half) lie beyond a 3 m arch, and Vey's office sits behind a 1.5 m door at the
 * stacks' east end.
 */
export const COUNTING_HOUSE_DEF: InteriorDef = {
  id: COUNTING_HOUSE_ID,
  site: { ...HARROWMARK_SITES['counting-house'] },
  rooms: [
    { id: 'entry-hall', x0: -6, z0: -4.5, x1: 6, z1: 1.5, height: 5 },
    { id: 'counting-hall', x0: -13, z0: -12.5, x1: 7, z1: -4.5, height: 5 },
    { id: 'stair-room', x0: 7, z0: -12.5, x1: 13, z1: -4.5, height: 5 },
    { id: 'stacks-arch', x0: -1.5, z0: -14.5, x1: 1.5, z1: -12.5, height: 5 },
    { id: 'stacks', x0: -13, z0: -20.5, x1: 3, z1: -14.5, height: 5 },
    { id: 'office-door', x0: 3, z0: -19, x1: 5, z1: -17.5, height: 3 },
    { id: 'office', x0: 5, z0: -20.5, x1: 13, z1: -14.5, height: 5 },
  ],
  pillars: [],
  props: [
    // Counting hall: two rows of desks inside the patrol loop.
    ...[-10, -6, -2].map((x, i) => ({ id: `desk.${i + 1}`, rect: { x0: x, z0: -8, x1: x + 2.5, z1: -7 }, height: 0.9 })),
    ...[-10, -6, -2].map((x, i) => ({ id: `desk.${i + 4}`, rect: { x0: x, z0: -10.5, x1: x + 2.5, z1: -9.5 }, height: 0.9 })),
    { id: 'desk.office', rect: { x0: 8, z0: -18, x1: 11, z1: -17 }, height: 0.9 },
    { id: 'cabinet.1', rect: { x0: 5, z0: -2.5, x1: 6, z1: -0.5 }, height: 1.8 },
    // Stacks.
    { id: 'shelf.1', rect: { x0: -11, z0: -18, x1: -7.5, z1: -17 }, height: 2.2 },
    { id: 'shelf.2', rect: { x0: -4.5, z0: -20, x1: -4, z1: -16 }, height: 2.2 },
    { id: 'shelf.3', rect: { x0: -2.5, z0: -20, x1: -2, z1: -16 }, height: 2.2 },
    { id: 'shelf.4', rect: { x0: 0.5, z0: -20, x1: 1, z1: -17 }, height: 2.2 },
    // Stair block with an under-stair nook (x 8..10, z -12.5..-9.5) whose mouth faces the counting hall.
    { id: 'stair.1', rect: { x0: 10, z0: -12.5, x1: 13, z1: -6.5 }, height: 2.5 },
    { id: 'stair.2', rect: { x0: 7, z0: -9.5, x1: 10, z1: -8.5 }, height: 2.5 },
    { id: 'stair.3', rect: { x0: 7, z0: -12.5, x1: 8, z1: -11 }, height: 2.5 },
  ],
  blockers: [],
  torches: [
    { x: -5.9, y: 2.5, z: -2 },
    { x: 5.9, y: 2.5, z: -3.5 },
    { x: -12.9, y: 2.5, z: -8.5 },
    { x: -6, y: 2.5, z: -12.4 },
    { x: 4, y: 2.5, z: -12.4 },
    { x: 12.9, y: 2.5, z: -5 },
    { x: -12.9, y: 2.5, z: -17.5 },
    { x: -5, y: 2.5, z: -20.4 },
    { x: 12.9, y: 2.5, z: -17.5 },
    { x: 9, y: 2.5, z: -20.4 },
  ],
  anchors: [
    { id: 'harrowmark.counting-house.entry', x: 0, z: -1, yaw: 0 },
    { id: 'harrowmark.counting-house.exit', x: 0, z: 0.5, yaw: 180 },
    { id: 'stealth.m09.entry', x: 0, z: -2.25, yaw: 0 },
    { id: 'stealth.m09.cp.hall', x: 5.25, z: -8.75, yaw: 270 },
    { id: 'stealth.m09.cp.office', x: 6.75, z: -18.25, yaw: 270 },
    { id: 'stealth.m09.exit', x: 1.75, z: 0.5, yaw: 180 },
    { id: 'hide.m09.1', x: -4.5, z: 0.5, yaw: 0 },
    { id: 'hide.m09.2', x: -3.25, z: -18, yaw: 180 },
    { id: 'hide.m09.3', x: 4, z: -1.5, facing: { x: 5.5, z: -1.5 } },
    { id: 'hide.m09.4', x: 9, z: -11, yaw: 90 },
    ...HALL_LOOP.map((p, i) => ({ id: `patrol.m09.hall.${i + 1}`, ...p, facing: next(HALL_LOOP, i) })),
    ...STACKS_LOOP.map((p, i) => ({ id: `patrol.m09.stacks.${i + 1}`, ...p, facing: next(STACKS_LOOP, i) })),
    { id: 'spawn.m09.watch-1', ...HALL_LOOP[0], facing: HALL_LOOP[1] },
    { id: 'spawn.m09.watch-2', ...HALL_LOOP[2], facing: HALL_LOOP[3] },
    { id: 'spawn.m09.watch-3', ...STACKS_LOOP[0], facing: STACKS_LOOP[1] },
    { id: 'spawn.m09.watch-4', x: 6.75, z: -15.75, facing: { x: 4, z: -18.25 } },
    { id: 'm09.invoice-1', x: 9.5, z: -15.75, yaw: 0 },
    { id: 'm09.invoice-2', x: 12.25, z: -17.5, yaw: 90 },
    { id: 'm09.invoice-3', x: 9.5, z: -19.25, yaw: 180 },
    { id: 'npc-post.merrin.inside', x: -3.25, z: -2.25, facing: { x: 0, z: 2 } },
    // Act 1 density pass, batch 4 (quests thread; additive): the Regent's day-book on the entry cabinet and his strongbox
    // in the office corner (M09)
    { id: 'm09.daybook', x: 4.4, z: -1.5, yaw: 90 },
    { id: 'm09.strongbox', x: 12, z: -19.5, yaw: 90 },
  ],
  triggers: [],
  doors: [
    {
      doorId: 'counting-house',
      outside: 'harrowmark.counting-house.door',
      inside: 'harrowmark.counting-house.entry',
      exit: 'harrowmark.counting-house.exit',
    },
  ],
  environment: {
    fogColor: 0x15110a,
    fogNear: 10,
    fogFar: 60,
    skyColor: 0xb8a070,
    groundColor: 0x221b10,
    ambientIntensity: 0.65,
    lightColor: 0xffd89a,
    lightIntensity: 15,
    lightDistance: 16,
  },
};
