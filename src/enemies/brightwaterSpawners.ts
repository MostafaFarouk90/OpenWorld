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
    // Live only once M04 has started and its Spare lesson has unlocked the verb.
    activation: { quest: 'm04', flag: 'enemies.mercy.spare' },
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
  // M03's churchyard wraiths: they rise from the four ash piles once the Release lesson has unlocked the verb.
  {
    id: 'brightwater.churchyard',
    tag: 'm03.churchyard',
    enemy: 'ash-wraith',
    count: 4,
    anchor: 'pile.churchyard.1',
    memberAnchors: numbered('pile.churchyard', 4),
    band: { min: 2, max: 3 },
    activation: { flag: 'enemies.mercy.release' },
    respawn: 'never',
    leash: true,
  },
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
  // R01 Wynn's scarecrows: only while R01 is active; cleared by the torch or the Surge, never by plain hits.
  {
    id: 'r01.scarecrows',
    enemy: 'ash-scarecrow',
    count: 6,
    anchor: 'r01.scarecrow.1',
    memberAnchors: [1, 2, 3, 4, 5, 6].map((i) => `r01.scarecrow.${i}`),
    band: { min: 2, max: 3 },
    activation: { quest: 'r01' },
    respawn: 'never',
    leash: false,
  },
  // The chapel vault's Blightbloom: wakes on entering the vault, raises wraiths from the three ash piles.
  {
    id: 'brightwater.vault.bloom',
    enemy: 'blightbloom',
    count: 1,
    anchor: 'vault.bloom',
    piles: ['vault.pile.1', 'vault.pile.2', 'vault.pile.3'],
    band: { min: 4, max: 5 },
    activation: { interior: 'chapel-vault' },
    respawn: 'never',
    leash: false,
  },
  // M04's ford barrier: only a heavy blow breaks it.
  {
    id: 'brightwater.ford.toll-post',
    tag: 'ford.toll-post',
    enemy: 'toll-post',
    count: 1,
    anchor: 'ford.toll-post',
    band: { min: 1, max: 1 },
    activation: { quest: 'm04' },
    respawn: 'never',
    leash: false,
  },
];
