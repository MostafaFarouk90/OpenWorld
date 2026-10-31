import type { QuestDef } from '../../types';

/**
 * j04 Tobb's First Verse (side job, offered by Tobb after the Quenchstone bond scene). Light the old fire ring on the road,
 * then give Tobb one line about the knighting: a three-way choice that writes `story.j04.verse` (ash | grain | bread), which
 * Tobb sings back at the Act 1 camp.
 */
export const j04: QuestDef = {
  id: 'j04',
  titleKey: 'quest.j04.title',
  summaryKey: 'quest.j04.summary',
  sequential: true,
  objectives: [
    { id: 'fire', type: 'interact', target: 'use:j04-fire', textKey: 'quest.j04.fire' },
    { id: 'verse', type: 'talk', target: 'tobb', textKey: 'quest.j04.verse' },
  ],
  rewards: [{ xp: 55 }, { giveGold: 10 }],
};
