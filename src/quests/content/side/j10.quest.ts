import type { QuestDef } from '../../types';

/**
 * j10 Tobb's Second Verse (side job, after M07 and j04). Tobb has the first verse and wants another from Harrowmark: light the
 * fire ring in the Tilted Anvil yard, and give him one line about the city. A three-way choice writes `story.j10.verse`
 * (forge | gate | hearth), which Tobb sings back at the Act 1 camp after j04's verse.
 */
export const j10: QuestDef = {
  id: 'j10',
  titleKey: 'quest.j10.title',
  summaryKey: 'quest.j10.summary',
  sequential: true,
  startWhen: { all: [{ quest: 'm07', state: 'completed' }, { quest: 'j04', state: 'completed' }] },
  objectives: [
    { id: 'fire', type: 'interact', target: 'use:j10-fire', textKey: 'quest.j10.fire' },
    { id: 'verse', type: 'talk', target: 'tobb', textKey: 'quest.j10.verse' },
  ],
  rewards: [{ xp: 50 }, { giveGold: 10 }],
};
