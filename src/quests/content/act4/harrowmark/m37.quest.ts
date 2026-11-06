import type { QuestDef } from '../../../types';
import { ACT4_REWARDS_IDS } from './rewards';
import { story } from '../../act2/helpers';

/** Q12: the Night Before waits for every other Phase G quest before the Council. */
export const M37_NEEDS = ['m35', 'm36', 'r19', 'r20', 'r21', 'r22', 'r23', 'd07'] as const;
export const M37_COMPANIONS = ['tobb', 'hrolf', 'aelfreda'] as const;
export type M37Companion = (typeof M37_COMPANIONS)[number];
/** Each bond scene is a one-way talk at the inn's table (the seat prop starts it), so no companion tree is edited. */
export const M37_BOND_NPC = (c: M37Companion): string => `scene.m37.${c}`;
export const M37_BOND_SCENE = (c: M37Companion): string => `scene-m37-${c}`;
export const M37_SEAT = (c: M37Companion): string => `use:m37-seat-${c}`;
export const M37_FEAST = 'use:m37-feast';
export const M37_FEAST_FLAG = 'story.m37.feast';
export const M37_TABLE = 'use:m37-table';
export const M37_SUNG = 'story.m37.sung';
export const M37_END = 'story.m37.toast';
export const M37_END_SCENE = 'scene-m37-toast';
export const M37_END_NPC = 'scene.m37.toast';

/**
 * M37 The Night Before (plan 2.1, 2.7). The feast at the Tilted Anvil: Tobb's offer carries the point-of-no-return line; three
 * bond scenes at the table, the war-song on the table top (one rhythm run), Gaut's quiet word by the back stair, and the last
 * toast. Bond rank 2 is set for all three companions (L0's effect), whichever two are seated.
 */
export const m37: QuestDef = {
  id: 'm37',
  titleKey: 'quest.m37.title',
  summaryKey: 'quest.m37.summary',
  sequential: true,
  startWhen: { all: M37_NEEDS.map((q) => ({ quest: q, state: 'completed' as const })) },
  objectives: [
    { id: 'brief', type: 'talk', target: 'tobb', textKey: 'quest.m37.brief' },
    { id: 'feast', type: 'interact', target: M37_FEAST, textKey: 'quest.m37.feast' },
    ...M37_COMPANIONS.map((c) => ({ id: c, type: 'talk' as const, target: M37_BOND_NPC(c), textKey: `quest.m37.${c}` })),
    story('song', 'quest.m37.song', M37_SUNG, { doneWhen: { flag: M37_SUNG, equals: true } }),
    { id: 'gaut', type: 'talk', target: 'gaut', textKey: 'quest.m37.gaut' },
    { id: 'toast', type: 'talk', target: M37_END_NPC, textKey: 'quest.m37.toast' },
  ],
  onComplete: M37_COMPANIONS.map((id) => ({ setCompanionRank: { id, rank: 2, source: 'm37' } })),
  rewards: [{ xp: 600 }, { give: [{ itemId: ACT4_REWARDS_IDS.m37, count: 1 }] }],
};
