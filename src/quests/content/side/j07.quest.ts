import type { QuestDef } from '../../types';

/**
 * j07 Rook's Board: Candles for the Chapel (side job, after M07). The Harrowmark sexton has no candles left for the three
 * niches in the chapel wall where the city leaves its dead names. Cael reads the notice, buys a bundle from the chandler's stall
 * at the chapel approach (an interact), lights one in each niche (three interacts), and tells the sexton. The job's completion
 * lights the codex entry on the niches.
 */
export const j07: QuestDef = {
  id: 'j07',
  titleKey: 'quest.j07.title',
  summaryKey: 'quest.j07.summary',
  sequential: true,
  startWhen: { quest: 'm07', state: 'completed' },
  objectives: [
    { id: 'notice', type: 'talk', target: 'note-j07-notice', textKey: 'quest.j07.notice' },
    { id: 'candles', type: 'interact', target: 'use:j07-candles', textKey: 'quest.j07.candles' },
    { id: 'niche1', type: 'interact', target: 'use:j07-niche-1', textKey: 'quest.j07.niche1' },
    { id: 'niche2', type: 'interact', target: 'use:j07-niche-2', textKey: 'quest.j07.niche2' },
    { id: 'niche3', type: 'interact', target: 'use:j07-niche-3', textKey: 'quest.j07.niche3' },
    { id: 'report', type: 'talk', target: 'sexton', textKey: 'quest.j07.report' },
  ],
  rewards: [{ xp: 55 }, { giveGold: 14 }],
};
