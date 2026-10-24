import { WATCH_GUARD_BAND } from '../../../../enemies/level';
import type { LevelBand, SpawnerDef } from '../../../../enemies/types';

const range = (prefix: string, from: number, to: number): string[] => Array.from({ length: to - from + 1 }, (_, i) => `${prefix}${from + i}`);
const common = { band: 'oldsmoke', respawn: 'never' as const };
/** M16's pass hounds: levels 12 to 14. */
export const M16_AMBUSH_BAND: LevelBand = { min: 12, max: 14 };

/** Quest-scoped groups of the Oldsmoke quests built so far. Anchors are A4's. */
export const OLDSMOKE_SPAWNERS: readonly SpawnerDef[] = [
  // M16: the pass hounds, once the road has been read. Levels 12 to 14 (the Knight is 14 when M16 starts on the headless chain),
  // not the region's 12 to 19: a level-19 pounce is 78 damage on a head hit (src/integration/difficulty.test.ts).
  {
    id: 'q13.m16.ambush', tag: 'm16.ambush', enemy: 'ember-hound', count: 4, anchor: 'oldsmoke.pass.ambush.1',
    memberAnchors: range('oldsmoke.pass.ambush.', 1, 4), activation: { quest: 'm16', flag: 'story.m16.houndsOut' }, leash: true,
    ...common, band: M16_AMBUSH_BAND,
  },
  // R09: three crawler nests under the market, woken by the foreman's briefing
  ...[1, 2, 3].map((n): SpawnerDef => ({
    id: `q13.r09.nest-${n}`, tag: 'r09.nest', enemy: 'slag-crawler', count: 3, anchor: `oldsmoke.market.nest.${n}`,
    activation: { quest: 'r09', flag: 'story.r09.nestsOut' }, leash: true, ...common,
  })),
  // M21: Aldous's loyalists at the hall door after a failed case (A4's hostile flag swaps the peaceful stewards out)
  {
    id: 'q13.m21.loyalists', tag: 'm21.loyalists', enemy: 'steward-guard', count: 4, anchor: 'oldsmoke.hall.guard.1',
    memberAnchors: range('oldsmoke.hall.guard.', 1, 4), activation: { quest: 'm21', flag: 'story.m21.loyalistsOut' }, leash: true, ...common,
  },
  // M21: the hall's watch for the spy section: observer-only guards on a loop, live while the quest is. Each member spawns
  // (and respawns after a capture) on the loop node its slot starts from: A4's watch-3 and watch-4 posts are in the gallery
  // and the study, walled off from the loop, so a guard sent from there stood stuck at the gallery checkpoint and caught
  // the player on every respawn there.
  {
    id: 'stealth.m21.watch', enemy: 'watch-guard', count: 4, anchor: 'patrol.m21.hall.1', memberAnchors: range('patrol.m21.hall.', 1, 4),
    patrol: range('patrol.m21.hall.', 1, 5), band: WATCH_GUARD_BAND, activation: { quest: 'm21' }, respawn: 'never', leash: false,
  },
];
