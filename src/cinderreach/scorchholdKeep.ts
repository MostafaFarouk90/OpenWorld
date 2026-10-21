import type { InteriorDef, LocalRect } from '../interiors/types';
import { KEEP_DOOR } from './scorchhold';

export const SCORCHHOLD_KEEP_ID = 'scorchhold-keep';
export const SCORCHHOLD_KEEP_DOOR_ID = 'scorchhold-keep';

const PILLAR_HALF = 0.7;
const pillar = (x: number, z: number): LocalRect => ({ x0: x - PILLAR_HALF, z0: z - PILLAR_HALF, x1: x + PILLAR_HALF, z1: z + PILLAR_HALF });

/**
 * The hunters' keep (D03's boss arena, greybox). Local metres from the door, yaw 0 faces -Z. An entry hall (14 x 15.5 m: the
 * ledgers, the buyer's seal, the letters and the cage manifest are on its desks) opens onto the 26 x 26 m arena where Thrandil
 * Redmane waits; the two prisoners are caged against the arena's side walls. The arena gate is open by default (A8 closes it
 * for the fight). The arena size is the plan thread's default for A8's lance charge; a larger one comes back to A3.
 */
export const SCORCHHOLD_KEEP_DEF: InteriorDef = {
  id: SCORCHHOLD_KEEP_ID,
  site: { x: KEEP_DOOR.x, z: KEEP_DOOR.z },
  rooms: [
    { id: 'entry', x0: -7, z0: -14, x1: 7, z1: 1.5, height: 6 },
    { id: 'arena', x0: -13, z0: -40, x1: 13, z1: -14, height: 12 },
  ],
  pillars: [pillar(-8, -20), pillar(8, -20), pillar(-8, -34), pillar(8, -34)],
  props: [
    { id: 'desk.1', rect: { x0: -6.5, z0: -5.5, x1: -3.5, z1: -4 }, height: 1 },
    { id: 'desk.2', rect: { x0: 3.5, z0: -5.5, x1: 6.5, z1: -4 }, height: 1 },
    { id: 'desk.3', rect: { x0: -6.5, z0: -11.5, x1: -3.5, z1: -10 }, height: 1 },
    { id: 'desk.4', rect: { x0: 3.5, z0: -11.5, x1: 6.5, z1: -10 }, height: 1 },
  ],
  blockers: [{ id: 'scorchhold.keep.arena.gate', rect: { x0: -7, z0: -14.5, x1: 7, z1: -13.5 }, height: 3 }],
  torches: [
    ...[-4, -10].flatMap((z) => [
      { x: -6.9, y: 3, z },
      { x: 6.9, y: 3, z },
    ]),
    ...[-18, -26, -34].flatMap((z) => [
      { x: -12.9, y: 4, z },
      { x: 12.9, y: 4, z },
    ]),
  ],
  anchors: [
    { id: 'cinderreach.scorchhold.keep.entry', x: 0, z: -1, yaw: 0 },
    { id: 'cinderreach.scorchhold.keep.exit', x: 0, z: 0.5, yaw: 180 },
    // D03: the four search points on the desks and the two caged prisoners.
    { id: 'cinderreach.d03.keep.1', x: -5, z: -3, facing: { x: -5, z: -5 } },
    { id: 'cinderreach.d03.keep.2', x: 5, z: -3, facing: { x: 5, z: -5 } },
    { id: 'cinderreach.d03.keep.3', x: -5, z: -9, facing: { x: -5, z: -11 } },
    { id: 'cinderreach.d03.keep.4', x: 5, z: -9, facing: { x: 5, z: -11 } },
    { id: 'cinderreach.d03.prisoner.1', x: -11.5, z: -27, facing: { x: 0, z: -27 } },
    { id: 'cinderreach.d03.prisoner.2', x: 11.5, z: -27, facing: { x: 0, z: -27 } },
    // A8's arena anchors.
    { id: 'scorchhold.keep.arena.door', x: 0, z: -12, facing: { x: 0, z: -27 } },
    { id: 'scorchhold.keep.arena.centre', x: 0, z: -27, yaw: 180 },
    { id: 'scorchhold.keep.arena.spawn.1', x: -9, z: -22, facing: { x: 0, z: -27 } },
    { id: 'scorchhold.keep.arena.spawn.2', x: 9, z: -22, facing: { x: 0, z: -27 } },
    { id: 'scorchhold.keep.arena.spawn.3', x: -9, z: -33, facing: { x: 0, z: -27 } },
    { id: 'scorchhold.keep.arena.spawn.4', x: 9, z: -33, facing: { x: 0, z: -27 } },
  ],
  triggers: [{ id: 'trg.scorchhold.keep.arena', center: { x: 0, y: 2, z: -27 }, half: { x: 13, y: 4, z: 13 } }],
  doors: [
    {
      doorId: SCORCHHOLD_KEEP_DOOR_ID,
      outside: 'cinderreach.scorchhold.keep.door',
      inside: 'cinderreach.scorchhold.keep.entry',
      exit: 'cinderreach.scorchhold.keep.exit',
    },
  ],
  environment: {
    fogColor: 0x120d0c,
    fogNear: 10,
    fogFar: 60,
    skyColor: 0x8a6a5a,
    groundColor: 0x1a1210,
    ambientIntensity: 0.5,
    lightColor: 0xffc08a,
    lightIntensity: 12,
    lightDistance: 20,
  },
};

export const SCORCHHOLD_KEEP_STRINGS_EN: Record<string, string> = {
  [`interior.enter.${SCORCHHOLD_KEEP_DOOR_ID}`]: '{key} Enter the keep',
  [`interior.exit.${SCORCHHOLD_KEEP_DOOR_ID}`]: '{key} Leave the keep',
};
