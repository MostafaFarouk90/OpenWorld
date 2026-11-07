// The reward item ids of the Waste quests, from L7's catalog (plans/act4-L7.md section 2). Importing the catalog registers the
// items at module scope, so a reward id exists by the time the defs load.
import { ACT4_REWARDS } from '../../../../items/act4/catalog';
import type { Effect } from '../../../types';

const one = (q: string): string => {
  const ids = ACT4_REWARDS[q];
  if (!ids || ids.length !== 1) throw new Error(`waste a4 rewards: ${q} has no single reward`);
  return ids[0]!;
};

export const WASTE_REWARD_IDS = {
  m42: one('m42'), m43: one('m43'), m44: one('m44'), r25: one('r25'), r24: one('r24'), m45: one('m45'), d08: one('d08'), m46: one('m46'),
} as const;

/** XP and the item (D08's Crown Shard is given in the report only on `defeated`, so D08's rewards carry XP alone). */
export const rewardOf = (q: Exclude<keyof typeof WASTE_REWARD_IDS, 'd08'>, xp: number): Effect[] =>
  [{ xp }, { give: [{ itemId: WASTE_REWARD_IDS[q], count: 1 }] }];
