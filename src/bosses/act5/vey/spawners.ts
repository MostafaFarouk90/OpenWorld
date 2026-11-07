import type { SpawnerDef } from '../../../enemies/types';
import { ARENA, CROWD } from './tuning';

/**
 * Vey's sworn guard (F7 Public, plan 2.2 D09): four of N5's household guards at N2's crowd posts, entering at his second break.
 * Two groups (two shields, two pikes) on one shield line, so the line can break (N5's lint) and Spare opens on it. Manual, never
 * respawned, never saved (ephemeral): each fight spawns them again. The Foundry's area, so the Act 5 cap (P + 3) applies.
 */
export const VEY_SPAWNERS: readonly SpawnerDef[] = [
  { id: CROWD.groups[0]!, role: 'shield', anchors: [ARENA.crowd[0]!, ARENA.crowd[1]!] },
  { id: CROWD.groups[1]!, role: 'pike', anchors: [ARENA.crowd[2]!, ARENA.crowd[3]!] },
].map(
  (g): SpawnerDef => ({
    id: g.id,
    tag: g.id,
    line: CROWD.line,
    enemy: 'warhost-guard',
    role: g.role as 'shield' | 'pike',
    count: 2,
    anchor: g.anchors[0],
    memberAnchors: g.anchors,
    band: 'caldera',
    area: 'caldera-foundry',
    activation: 'manual',
    respawn: 'never',
    leash: false,
    ephemeral: true,
  }),
);
