import type { SpawnerDef } from './types';

/**
 * Brightwater's foe spawners (plans/slice-2-enemies.md 2.3, 2.4 and the M04 toll post). Foes are
 * brainless mortal actors, not `EnemyKind`s; they spawn through the same spawner path. Anchor ids are
 * thread 4's; a missing one warns and spawns nothing (member anchors fall back to a ring).
 */
export const BRIGHTWATER_SPAWNERS: readonly SpawnerDef[] = [
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
    anchor: 'spawn.ford.toll-post',
    band: { min: 1, max: 1 },
    activation: { quest: 'm04' },
    respawn: 'never',
    leash: false,
  },
];
