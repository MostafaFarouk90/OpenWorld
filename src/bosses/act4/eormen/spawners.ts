import type { SpawnerDef } from '../../../enemies/types';
import { ARENA, HUSKS, HUSK_SKIN } from './tuning';

/**
 * Eormen's phase husks (plans/act4-L6.md "PR 2", A): one group per phase, three Ash Wraiths in the `wraith-husk` skin on the
 * nave's ash piles 1 to 3 (L5's night group takes 4 to 6). Manual, never respawned, never saved (ephemeral): each phase of each
 * fight spawns its group again. The Ashen Waste band, so the Act 4 cap (P + 3) applies.
 */
export const EORMEN_SPAWNERS: readonly SpawnerDef[] = HUSKS.groups.map(
  (id): SpawnerDef => ({
    id,
    tag: id,
    enemy: 'ash-wraith',
    count: HUSKS.perPhase,
    anchor: ARENA.ash[0]!,
    memberAnchors: [...ARENA.ash],
    band: 'ashen-waste',
    skin: HUSK_SKIN,
    activation: 'manual',
    respawn: 'never',
    leash: false,
    ephemeral: true,
  }),
);
