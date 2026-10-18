import { GUILDHALL_THUG_TAG } from './guildhall/def';
import { WATCH_GUARD_BAND } from './level';
import type { SpawnerDef } from './types';

const members = (prefix: string, from: number, to: number): string[] =>
  Array.from({ length: to - from + 1 }, (_, i) => `${prefix}${from + i}`);

/**
 * The Dead Road Footman camps. Thread 4 owns the group defs (3 Footmen each, in brightwaterSpawners.ts); only the
 * ids are exported here, as the stable list thread 19's budget test and purse whitelist import.
 */
export const DEAD_ROAD_CAMP_SPAWNER_IDS = ['deadroad.camp-1', 'deadroad.camp-2'] as const;

/**
 * Harrowmark, slice 2 phase B (plans: slice-2-enemies-phase-b.md item 5; anchors from
 * slice-2-harrowmark-city.md section 187 and -city-review.md for thread 17's, slice-2-interiors-nav-phase-b.md
 * and -review.md "Exact names to send" for thread 3a's). A missing anchor warns once and spawns nothing.
 * Levels sit inside Harrowmark's {4, 9}; nothing respawns on rest.
 */
export const HARROWMARK_SPAWNERS: readonly SpawnerDef[] = [
  // R03 The Brewer's Debt (quests-phase-b.md): o2 kills 3 guildhall-thugs tagged r03.guildhall once R03 starts
  // (o1 talks to Aldith). Thugs do not flee, so exactly 3 is enough. Anchors r03.guildhall.1-3 are thread 17's.
  // The tag is thread 19's purse key: keep it stable.
  {
    id: 'r03.guildhall',
    tag: GUILDHALL_THUG_TAG,
    enemy: 'guildhall-thug',
    count: 3,
    anchor: 'r03.guildhall.1',
    memberAnchors: members('r03.guildhall.', 1, 3),
    band: { min: 5, max: 6 },
    activation: { quest: 'r03' },
    respawn: 'never',
    leash: true,
  },
  // M07 The Tilted Anvil: o2 kills 3 alley-cutpurses tagged m07.thieves once M07 starts. Exactly 3 members on
  // m07.thieves.1-3 (thread 17), no margin: a cutpurse that robs the player and escapes (flees and despawns)
  // frees its slot, and the registry refills it at its anchor after CUTPURSE.refillSeconds while M07 is live, so
  // the objective cannot stall. An escape never counts as gone, so `enemies.groupCleared` waits for the refill.
  {
    id: 'm07.thieves',
    tag: 'm07.thieves',
    enemy: 'alley-cutpurse',
    count: 3,
    anchor: 'm07.thieves.1',
    memberAnchors: members('m07.thieves.', 1, 3),
    band: { min: 4, max: 5 },
    activation: { quest: 'm07' },
    respawn: 'never',
    leash: false,
  },
  // D02 Hounds of the Underways: six hounds in two kennels, live on entering the Underways (anchors are thread 3a's,
  // `underways.spawn.hound-1..6`, per the interiors review) tagged d02.kennels. Thread 6's o3 needs 4 Calms/kills of 6:
  // a margin of 2 for hounds that flee at 15% health (a fleeing hound goes idle and returns). Not ephemeral: kills and mercy persist. Slot 0 leads each pack.
  ...[1, 2].map(
    (n): SpawnerDef => ({
      id: `underways.kennel-${n}`,
      tag: 'd02.kennels',
      enemy: 'ember-hound',
      count: 3,
      anchor: `underways.spawn.hound-${n * 3 - 2}`,
      memberAnchors: members('underways.spawn.hound-', n * 3 - 2, n * 3),
      band: { min: 6, max: 7 },
      activation: { interior: 'underways' },
      respawn: 'never',
      leash: true,
      leaderSlot: 0,
    }),
  ),
  // Gaffer Grimtooth's summoned pack: four hounds on underways.summon.1..4. Manual and ephemeral (never saved);
  // thread 3b spawns it and resets it per wave through the enemies service.
  {
    id: 'grimtooth-summons',
    enemy: 'ember-hound',
    count: 4,
    anchor: 'underways.summon.1',
    memberAnchors: members('underways.summon.', 1, 4),
    band: { min: 7, max: 8 },
    activation: 'manual',
    respawn: 'never',
    leash: false,
    ephemeral: true,
    leaderSlot: 0,
  },
  // M06 The South Gate (stealth): three observer-only watch guards on the gate square, live while M06 is active.
  // Guards stand on spawn.m06.watch-1..3 and walk the loop patrol.m06.gate-square.1..5 (thread 17's names;
  // slice-2-stealth-chase.md section 12 B1 and B3). Thread 18 reads them through enemies.perception.state.
  {
    id: 'stealth.m06.watch',
    enemy: 'watch-guard',
    count: 3,
    anchor: 'spawn.m06.watch-1',
    memberAnchors: members('spawn.m06.watch-', 1, 3),
    patrol: members('patrol.m06.gate-square.', 1, 5),
    band: WATCH_GUARD_BAND,
    activation: { quest: 'm06' },
    respawn: 'never',
    leash: false,
  },
  // M09 Oswin's Ledger: observer-only watch-guards in the Counting-House (interior id `counting-house`; anchors
  // spawn.m09.watch-1..4 are 3a's, stealth plan: 4 is the static clerk-watch). Split: hall 2 (watch-1, 2, patrolling
  // the hall), stacks 1 (watch-3, patrolling the stacks), clerk 1 (watch-4, stationary). Patrol waypoints
  // patrol.m09.hall.1..n and patrol.m09.stacks.1..n are looked up by tag, so no count is baked in here.
  watch('stealth.m09.hall', [1, 2], { tag: 'patrol.m09.hall' }),
  watch('stealth.m09.stacks', [3], { tag: 'patrol.m09.stacks' }),
  watch('stealth.m09.clerk', [4]),
];

function watch(id: string, slots: readonly number[], patrol?: { tag: string }): SpawnerDef {
  return {
    id,
    enemy: 'watch-guard',
    count: slots.length,
    anchor: `spawn.m09.watch-${slots[0]}`,
    memberAnchors: slots.map((i) => `spawn.m09.watch-${i}`),
    ...(patrol ? { patrol } : {}),
    band: WATCH_GUARD_BAND,
    activation: { interior: 'counting-house' },
    respawn: 'never',
    leash: false,
  };
}
