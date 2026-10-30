import type { SpawnerDef } from '../../types';
import { DRAKE_DEV_SPAWNERS } from '../drake/def';

/**
 * The midpoint's two resting wyrms on Wyrmwatch Lodge (K6a PR 1, plan 2.7 "Thorgar's hunters stand watch with the
 * dragons"): peaceful Ember Wyrms from `story.m34.complete`, perched on the hall roof ridge at a third and two thirds of
 * its length, facing south over the yard. The anchors are defined at runtime from K4's hall box (`lodge.info.hall`), and
 * the perch pins each one there at the roof's height while it rests (large/flightExtras.ts).
 */
export const LODGE_WYRMS = {
  spawnerId: 'wyrm.lodge.resting',
  flag: 'story.m34.complete',
  anchor: (n: 1 | 2) => `dragonspine.lodge.wyrm.rest.${n}`,
  /** Along the ridge, as shares of the hall's width from its west end. */
  along: [1 / 3, 2 / 3] as const,
  /** Back from the hall's centre line toward the north (+Z) so the body lies on the roof. */
  back: 3,
  /** Above the hall's top (the wyrm's feet). */
  perchLift: 0.2,
  /** Facing south over the yard (yaw 0 faces -Z). */
  yaw: 0,
} as const;

export interface HallBox {
  x: number;
  z: number;
  w: number;
  d: number;
  h: number;
}

/** The two perch points (engine x, z) and the perch height above the ground under the hall. */
export function lodgePerches(hall: HallBox): { id: string; x: number; z: number; altitude: number; yaw: number }[] {
  const x0 = hall.x - hall.w / 2;
  return LODGE_WYRMS.along.map((k, i) => ({
    id: LODGE_WYRMS.anchor((i + 1) as 1 | 2),
    x: x0 + hall.w * k,
    z: hall.z + LODGE_WYRMS.back,
    altitude: hall.h + LODGE_WYRMS.perchLift,
    yaw: LODGE_WYRMS.yaw,
  }));
}

export const LODGE_WYRM_SPAWNERS: readonly SpawnerDef[] = [
  {
    id: LODGE_WYRMS.spawnerId,
    tag: LODGE_WYRMS.spawnerId,
    enemy: 'ember-wyrm',
    count: 2,
    anchor: LODGE_WYRMS.anchor(1),
    memberAnchors: [LODGE_WYRMS.anchor(1), LODGE_WYRMS.anchor(2)],
    band: 'dragonspine',
    block: 'dragonspine-lower',
    activation: { flag: LODGE_WYRMS.flag },
    respawn: 'onRest',
    leash: true,
    peaceful: true,
  },
];

/** K6a's spawner table (the enemies plugin adds it): the lodge wyrms and the dev drake. Their anchors are defined at runtime. */
export const ACT3_DRAGON_SPAWNERS: readonly SpawnerDef[] = [...LODGE_WYRM_SPAWNERS, ...DRAKE_DEV_SPAWNERS];
