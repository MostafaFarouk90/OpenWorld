// The reward items of the Rim quests, from N7's catalog (src/items/act5/catalog.ts): every id N7 lists for the quest, counted
// (M48 and M50 each pay a forge-heart fragment, FRAGMENT_SOURCES). Importing the catalog registers the items at module scope.
import { ACT5_REWARDS } from '../../../../items/act5/catalog';
import type { Effect } from '../../../types';

export type RimRewardQuest = 'm47' | 'm48' | 'm49' | 'r26' | 'r29' | 'm50' | 'm51' | 'm52';

/** XP and every item N7's table names for the quest (repeats counted). Throws if N7 lists nothing for it. */
export function rewardOf(q: RimRewardQuest, xp: number): Effect[] {
  const ids = ACT5_REWARDS[q];
  if (!ids || ids.length === 0) throw new Error(`rim a5 rewards: ${q} has no reward in ACT5_REWARDS`);
  const counts = new Map<string, number>();
  for (const id of ids) counts.set(id, (counts.get(id) ?? 0) + 1);
  return [{ xp }, { give: [...counts].map(([itemId, count]) => ({ itemId, count })) }];
}
