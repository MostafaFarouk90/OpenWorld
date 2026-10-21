import type { SpawnerDef } from '../types';
import './overlays';

/**
 * The wyrm spawner groups (plans/act2-A6a.md 1.6). Importing this module also registers the wyrm behaviour overlays.
 * Anchors are A2's and A3's; until their layouts merge a missing anchor warns once and spawns nothing.
 */

/** A2's two wyrm-nest POIs (ids agreed with A2: `wyrm-nest-1`, `wyrm-nest-2`); one Ember Wyrm each. */
export const WYRM_NEST_IDS = ['wyrm-nest-1', 'wyrm-nest-2'] as const;

/** An Ember Wyrm group on any anchor (A12's and A13's quest groups use this for their own ids). */
export function emberWyrmSpawner(id: string, anchor: string, extra: Partial<SpawnerDef> = {}): SpawnerDef {
  return { id, enemy: 'ember-wyrm', count: 1, anchor, band: 'cinderreach', activation: 'manual', respawn: 'never', leash: true, ...extra };
}

/** A wyrmling group (the M15 cage, A13's nursery): `count` members on `memberAnchors` or a ring round `anchor`. */
export function wyrmlingSpawner(id: string, anchor: string, count: number, extra: Partial<SpawnerDef> = {}): SpawnerDef {
  return { id, enemy: 'wyrmling', count, anchor, band: 'cinderreach', activation: 'manual', respawn: 'never', leash: false, leaderSlot: 0, ...extra };
}

export const WYRM_SPAWNERS: readonly SpawnerDef[] = [
  // Ambient nests: present once Cinderreach opens, back after a rest.
  ...WYRM_NEST_IDS.map((nest) =>
    emberWyrmSpawner(`wyrm.nest.${nest}`, `poi.a2.${nest}.spawn.1`, {
      tag: 'wyrm.nest',
      activation: { flag: 'story.gate.a2' },
      respawn: 'onRest',
    }),
  ),
  // R11 Hrolf's Brother's Axe: the den wyrm the quest fights or spares (A12 runs the quest; the group is gone once the
  // choice is made), then the same wyrm resting peacefully on its shelf after a spare.
  emberWyrmSpawner('wyrm.r11.den', 'cinderreach.den.wyrm.rest', {
    tag: 'r11.den',
    activation: { quest: 'r11' },
    leash: true,
  }),
  emberWyrmSpawner('wyrm.den.resting', 'cinderreach.den.wyrm.rest', {
    tag: 'wyrm.den.resting',
    activation: { flag: 'world.cinderreach.den.spared' },
    respawn: 'onRest',
    peaceful: true,
  }),
  // Dev only (`?wyrms=1`): manual and never saved; their `dev.wyrm.*` anchors exist only once the hook defines them.
  emberWyrmSpawner('wyrm.dev.flier', 'dev.wyrm.flier', { tag: 'wyrm.dev', ephemeral: true, leash: false }),
  wyrmlingSpawner('wyrm.dev.wyrmlings', 'dev.wyrm.wyrmlings', 2, { tag: 'wyrm.dev', ephemeral: true }),
];
