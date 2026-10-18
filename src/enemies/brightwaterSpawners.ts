import type { SpawnerDef } from './types';

const numbered = (prefix: string, n: number): string[] => Array.from({ length: n }, (_, i) => `${prefix}-${i + 1}`);

/** Hollin Ford's Footman pairs (M04): one group per pair, so a pack Spare finds the partner. */
function ford(n: number): SpawnerDef {
  return {
    id: `brightwater.ford.pair-${n}`,
    enemy: 'blighted-soldier',
    count: 2,
    anchor: `spawn.ford.pair-${n}`,
    band: { min: 3, max: 4 },
    activation: { quest: 'm04' },
    respawn: 'never',
    leash: true,
  };
}

/** A Dead Road wraith patrol: three wraiths rising from ash piles; the road closes when the wardstones are done. */
function patrol(n: number): SpawnerDef {
  const first = (n - 1) * 3;
  return {
    id: `brightwater.deadroad.patrol-${n}`,
    enemy: 'ash-wraith',
    count: 3,
    anchor: `spawn.deadroad.patrol-${n}`,
    memberAnchors: [1, 2, 3].map((i) => `pile.deadroad.${first + i}`),
    patrol: [1, 2, 3, 4].map((i) => `patrol.deadroad.${n}.${i}`),
    band: { min: 2, max: 4 },
    activation: { until: 'world.deadroad.wardstones.done' },
    respawn: 'never',
    leash: true,
  };
}

/**
 * Brightwater, slice 2 (anchor ids: world-layout-and-npcs.md section 6; thread 4 and thread 3a place them).
 * Levels stay inside 1 to 9, and no group respawns on rest.
 */
export const BRIGHTWATER_SPAWNERS: readonly SpawnerDef[] = [
  ...[1, 2].map((n) => ford(n)),
  ...[1, 2].map((n) => patrol(n)),
  {
    id: 'brightwater.vault',
    enemy: 'ash-wraith',
    count: 3,
    anchor: 'vault.spawn.wraith-1',
    memberAnchors: numbered('vault.spawn.wraith', 3),
    band: { min: 4, max: 5 },
    activation: { interior: 'chapel-vault' },
    respawn: 'never',
    leash: true,
  },
  // The Prior's summons: one group per wave slot, never saved; thread 3b calls `enemies.reset(id)` before each wave.
  ...[1, 2, 3, 4].map(
    (n): SpawnerDef => ({
      id: `brightwater.prior-summon.${n}`,
      enemy: 'ash-wraith',
      count: 1,
      anchor: `vault.summon.${n}`,
      memberAnchors: [`vault.summon.${n}`],
      band: { min: 4, max: 5 },
      activation: 'manual',
      respawn: 'never',
      leash: false,
      ephemeral: true,
    }),
  ),
];
