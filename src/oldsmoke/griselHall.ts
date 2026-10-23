import type { InteriorDef, LocalRect } from '../interiors/types';
import { HALL_DOOR } from './sites';

export const GRISEL_HALL_ID = 'grisel-hall';
export const GRISEL_HALL_DOOR_ID = 'grisel-hall';
/** Opens when A13 accepts M16 (Aldous's invitation); exits never lock. */
export const GRISEL_HALL_LOCK_FLAG = 'story.m16.started';

const PILLAR_HALF = 0.7;
const pillar = (x: number, z: number): LocalRect => ({ x0: x - PILLAR_HALF, z0: z - PILLAR_HALF, x1: x + PILLAR_HALF, z1: z + PILLAR_HALF });
const rect = (x0: number, z0: number, x1: number, z1: number): LocalRect => ({ x0, z0, x1, z1 });

/**
 * Grisel Hall (greybox). Local metres from the door, yaw 0 faces -Z. A foyer opens onto the 28 x 26 m audience hall with
 * Aldous's dais at the far end and two long tables. Three hidden ways serve the M21 spy section: a service corridor from the foyer to
 * the east gallery (a 2 m wall separates it from the hall), a corridor behind the dais, and Aldous's study (west), which also has a
 * door onto the hall (a blocker A13 can close). The peaceful stewards stand along the hall's side walls; when M21 turns hostile
 * their posts are the hall guards' spawn points.
 */
export const GRISEL_HALL_DEF: InteriorDef = {
  id: GRISEL_HALL_ID,
  site: { x: HALL_DOOR.x, z: HALL_DOOR.z },
  rooms: [
    { id: 'foyer', x0: -6, z0: -8, x1: 6, z1: 1.5, height: 5 },
    { id: 'audience', x0: -14, z0: -34, x1: 14, z1: -8, height: 11 },
    { id: 'study-door', x0: -16, z0: -26, x1: -14, z1: -22, height: 4 },
    { id: 'study', x0: -23, z0: -39, x1: -16, z1: -19, height: 4 },
    { id: 'back', x0: -16, z0: -39, x1: 16, z1: -36, height: 3.5 },
    { id: 'gallery', x0: 16, z0: -39, x1: 24, z1: 0, height: 4 },
    { id: 'service', x0: 6, z0: -5, x1: 16, z1: -2, height: 3.5 },
  ],
  pillars: [pillar(-9, -16), pillar(9, -16), pillar(-9, -28), pillar(9, -28)],
  props: [
    { id: 'dais.1', rect: rect(-8, -33, 8, -29), height: 0.4, walkable: true },
    { id: 'table.1', rect: rect(-7, -26, -4.5, -12), height: 0.9 },
    { id: 'table.2', rect: rect(4.5, -26, 7, -12), height: 0.9 },
    { id: 'desk.1', rect: rect(-22.6, -35, -19.6, -33.5), height: 1 },
    { id: 'cabinet.1', rect: rect(-22.8, -30, -21.8, -27), height: 1.6 },
    { id: 'shelf.1', rect: rect(-22.8, -24, -21.9, -21), height: 1.6 },
    { id: 'shelf.2', rect: rect(16.1, -34, 17, -30), height: 1.6 },
    { id: 'shelf.3', rect: rect(16.1, -14, 17, -10), height: 1.6 },
  ],
  blockers: [{ id: 'oldsmoke.hall.study.door', rect: rect(-15.5, -26, -14.5, -22), height: 3 }],
  torches: [
    ...[-12, -20, -28].flatMap((z) => [
      { x: -13.9, y: 4, z },
      { x: 13.9, y: 4, z },
    ]),
    { x: -5.9, y: 3, z: -4 },
    { x: 5.9, y: 3, z: -4 },
    { x: -19.5, y: 2.6, z: -38.8 },
  ],
  anchors: [
    { id: 'oldsmoke.hall.entry', x: 0, z: -1, yaw: 0 },
    { id: 'oldsmoke.hall.exit', x: 0, z: 0.5, yaw: 180 },
    // Aldous on the dais, Wenna at its side, four stewards along the side walls (peaceful).
    { id: 'oldsmoke.hall.dais', x: 0, z: -31, yaw: 180 },
    { id: 'oldsmoke.hall.aldous', x: 0, z: -31.5, yaw: 0, facing: { x: 0, z: -4 } },
    { id: 'oldsmoke.hall.wenna', x: 5.5, z: -31, facing: { x: 0, z: -4 } },
    { id: 'oldsmoke.hall.steward.1', x: -12, z: -14, facing: { x: 0, z: -21 } },
    { id: 'oldsmoke.hall.steward.2', x: 12, z: -14, facing: { x: 0, z: -21 } },
    { id: 'oldsmoke.hall.steward.3', x: -12, z: -26, facing: { x: 0, z: -21 } },
    { id: 'oldsmoke.hall.steward.4', x: 12, z: -26, facing: { x: 0, z: -21 } },
    // Where the hall guards stand if M21 turns hostile (A13 owns the spawner; the peaceful stewards above are hidden then).
    { id: 'oldsmoke.hall.guard.1', x: -4, z: -10, facing: { x: 0, z: -20 } },
    { id: 'oldsmoke.hall.guard.2', x: 4, z: -10, facing: { x: 0, z: -20 } },
    { id: 'oldsmoke.hall.guard.3', x: -11, z: -20, facing: { x: 0, z: -10 } },
    { id: 'oldsmoke.hall.guard.4', x: 11, z: -20, facing: { x: 0, z: -10 } },
    // M21's stealth section (A13 owns the section data and the guards): checkpoints, hide spots, the watch guards and their loop.
    // The start (and a capture's respawn) is in the service passage, where the foyer's east wall hides it from the hall's loop.
    { id: 'oldsmoke.stealth.m21.start', x: 8, z: -3.5, yaw: -90 },
    { id: 'oldsmoke.stealth.m21.cp.gallery', x: 20, z: -22, yaw: 0 },
    { id: 'oldsmoke.stealth.m21.cp.study', x: -19.5, z: -28.5, yaw: 90 },
    { id: 'oldsmoke.stealth.m21.end', x: 0, z: -3, yaw: 180 },
    { id: 'oldsmoke.hide.m21.1', x: 18.5, z: -12, yaw: 0 },
    { id: 'oldsmoke.hide.m21.2', x: 20.5, z: -32, yaw: 0 },
    { id: 'oldsmoke.hide.m21.3', x: 0, z: -37.5, yaw: 0 },
    { id: 'oldsmoke.hide.m21.4', x: -21.5, z: -37, yaw: 0 },
    { id: 'spawn.m21.watch-1', x: -3, z: -12, yaw: 0 },
    { id: 'spawn.m21.watch-2', x: 3, z: -27, yaw: 180 },
    { id: 'spawn.m21.watch-3', x: 20, z: -15, yaw: 0 },
    { id: 'spawn.m21.watch-4', x: -19.5, z: -23, yaw: 0 },
    ...(
      [
        [-3, -12],
        [3, -12],
        [3, -27],
        [-3, -27],
        [0, -20],
      ] as const
    ).map(([x, z], i) => ({ id: `patrol.m21.hall.${i + 1}`, x, z, yaw: 0 })),
    // The letters in the study and the evidence points elsewhere in the hall (M21 spy).
    { id: 'oldsmoke.hall.study.letter.1', x: -20.5, z: -32.5, facing: { x: -21, z: -34.5 } },
    { id: 'oldsmoke.hall.study.letter.2', x: -20.5, z: -28.5, facing: { x: -22.3, z: -28.5 } },
    { id: 'oldsmoke.hall.study.letter.3', x: -20.5, z: -22.5, facing: { x: -22.4, z: -22.5 } },
    { id: 'oldsmoke.m21.evidence.1', x: -7, z: -30, yaw: 0 },
    { id: 'oldsmoke.m21.evidence.2', x: 6, z: -37.5, yaw: 0 },
    { id: 'oldsmoke.m21.evidence.3', x: 20, z: -36, yaw: 0 },
  ],
  triggers: [{ id: 'trg.oldsmoke.hall.audience', center: { x: 0, y: 3, z: -21 }, half: { x: 14, y: 4, z: 13 } }],
  doors: [
    {
      doorId: GRISEL_HALL_DOOR_ID,
      outside: 'oldsmoke.hall.door',
      inside: 'oldsmoke.hall.entry',
      exit: 'oldsmoke.hall.exit',
    },
  ],
  environment: {
    fogColor: 0x0f1612,
    fogNear: 12,
    fogFar: 70,
    skyColor: 0x7a8a6a,
    groundColor: 0x161c12,
    ambientIntensity: 0.55,
    lightColor: 0xffd9a0,
    lightIntensity: 14,
    lightDistance: 26,
  },
};

export const GRISEL_HALL_STRINGS_EN: Record<string, string> = {
  [`interior.enter.${GRISEL_HALL_DOOR_ID}`]: '{key} Enter Grisel Hall',
  [`interior.exit.${GRISEL_HALL_DOOR_ID}`]: '{key} Leave Grisel Hall',
};
