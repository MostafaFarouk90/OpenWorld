// The Foundry block's rewards from N7's catalog (`ACT5_REWARDS`, plans/act5-N7.md section 2). Importing the catalog registers
// the items at module scope, so a reward id exists by the time the defs load. XP is the design's (plan 2.2).
import { ACT5_REWARDS } from '../../../../items/act5/catalog';
import type { Effect } from '../../../types';

export const FOUNDRY_XP = { r27: 700, r28: 700, r30: 700, m53: 1000, d09: 1500, m54: 1000, m55: 1100, d10: 2000, m56: 1500 } as const;
export type RewardedQuest = keyof typeof FOUNDRY_XP;

/** The quest's catalog items, counted (D09's two fragments are one give of two). */
export function rewardItems(q: RewardedQuest): { itemId: string; count: number }[] {
  const ids = ACT5_REWARDS[q];
  if (!ids || ids.length === 0) throw new Error(`foundry a5 rewards: ${q} has no reward row`);
  const counts = new Map<string, number>();
  for (const id of ids) counts.set(id, (counts.get(id) ?? 0) + 1);
  return [...counts].map(([itemId, count]) => ({ itemId, count }));
}

/** XP and every catalog item (M56 is the exception: its keepsake is by branch, see m56.quest.ts). */
export const rewardOf = (q: Exclude<RewardedQuest, 'm56'>): Effect[] => [{ xp: FOUNDRY_XP[q] }, { give: rewardItems(q) }];
