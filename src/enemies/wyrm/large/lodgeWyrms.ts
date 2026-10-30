import type { SpawnerDef } from '../../types';
import { DRAKE_DEV_SPAWNERS } from '../drake/def';

/**
 * The midpoint's two resting wyrms at Wyrmwatch Lodge (K6a PR 1, plan 2.7 "Thorgar's hunters stand watch with the
 * dragons"): peaceful Ember Wyrms from `story.m34.complete`, one on each of the two south-corner towers (K4's
 * `lodge.info.towers`), facing south over the approach. The hall roof was the first choice, but the hall's art is a fitted
 * castle about 56 m tall with spires and no ridge (real-game probe 2026-10-30), so the towers (the coordinator's fallback)
 * carry them. The anchors are defined at runtime; the perch pins each one on its tower top while it rests
 * (large/flightExtras.ts).
 */
export const LODGE_WYRMS = {
  spawnerId: 'wyrm.lodge.resting',
  flag: 'story.m34.complete',
  anchor: (n: 1 | 2) => `dragonspine.lodge.wyrm.rest.${n}`,
  /** The tower art's top above the ground (`hex/building_tower_base_red` fitted to K4's 7 m square, measured in game). */
  towerTop: 10,
  /** Above the tower top (the wyrm's feet). */
  perchLift: 0.2,
  /** Facing south over the approach (yaw 0 faces -Z). */
  yaw: 0,
  /** Struck off the tower, it lands this far beyond the tower's yard-side faces (inward and north, in the yard). */
  dropOut: 6,
} as const;

/** The parts of K4's tower specs the perches read. */
export interface TowerBox {
  x: number;
  z: number;
  footprint: [number, number];
}

/** The two perches (engine x, z), their height above the ground, and where each lands when struck. */
export function lodgePerches(towers: readonly TowerBox[]): { id: string; x: number; z: number; altitude: number; yaw: number; drop: { x: number; z: number } }[] {
  const mid = towers.reduce((a, t) => a + t.x, 0) / Math.max(1, towers.length);
  return towers.slice(0, 2).map((t, i) => {
    const inward = Math.sign(mid - t.x) || 1;
    return {
      id: LODGE_WYRMS.anchor((i + 1) as 1 | 2),
      x: t.x,
      z: t.z,
      altitude: LODGE_WYRMS.towerTop + LODGE_WYRMS.perchLift,
      yaw: LODGE_WYRMS.yaw,
      drop: { x: t.x + inward * (t.footprint[0] / 2 + LODGE_WYRMS.dropOut), z: t.z + t.footprint[1] / 2 + LODGE_WYRMS.dropOut },
    };
  });
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
    // The spawn anchors sit inside the towers' footprints (under the perch): a leash home there would walk it into the wall.
    leash: false,
    peaceful: true,
  },
];

/** K6a's spawner table (the enemies plugin adds it): the lodge wyrms and the dev drake. Their anchors are defined at runtime. */
export const ACT3_DRAGON_SPAWNERS: readonly SpawnerDef[] = [...LODGE_WYRM_SPAWNERS, ...DRAKE_DEV_SPAWNERS];
