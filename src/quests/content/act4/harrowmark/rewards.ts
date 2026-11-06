// The reward item ids of the Harrowmark quests, from L7's catalog (plans/act4-L7.md section 2). Importing the catalog also
// registers the items at module scope, so a quest reward id always exists by the time the quest defs load.
import { ACT4_KEEPSAKES, ACT4_REWARDS } from '../../../../items/act4/catalog';

const one = (q: string): string => {
  const ids = ACT4_REWARDS[q];
  if (!ids || ids.length !== 1) throw new Error(`harrowmark a4 rewards: ${q} has no single reward`);
  return ids[0]!;
};

export const ACT4_REWARDS_IDS = {
  m35: one('m35'), m36: one('m36'), r19: one('r19'), r20: one('r20'), r21: one('r21'), r23: one('r23'), d07: one('d07'), m37: one('m37'),
  m40: one('m40'), m41: one('m41'),
} as const;

/** R22's blade, by `story.r22.choice` (L7's `practiceBladeFor`). */
export const R22_BLADE = { light: ACT4_KEEPSAKES.practiceBladeLight, heavy: ACT4_KEEPSAKES.practiceBladeHeavy } as const;
