import type { Condition, QuestDef } from '../../types';

/** Either stone found (read to its last line) lets the quest start; the reading itself starts it (boards.ts `startingNote`). */
export const J03_START_WHEN: Condition = { any: [{ flag: 'story.j03.bluffRead' }, { flag: 'story.j03.tabletRead' }] };

/**
 * j03 Waystones of the Dead Road (side job, no giver). A Leap-gated waystone on a bluff above the road's western end, and a
 * barrow further east with a grave tablet and two wraiths. The quest starts by itself on reading either stone; the barrow
 * pair is armed by the quest having started (`story.j03.started`, a quest-level objective flag) and never respawns. The three
 * batch 2 Dead Road points of interest are separate and stay uncounted.
 */
export const j03: QuestDef = {
  id: 'j03',
  titleKey: 'quest.j03.title',
  summaryKey: 'quest.j03.summary',
  startWhen: J03_START_WHEN,
  objectives: [
    { id: 'bluff', type: 'talk', target: 'note-j03-bluff', textKey: 'quest.j03.bluff' },
    { id: 'wake', type: 'kill', target: 'ash-wraith', required: 2, spawnTag: 'j03.barrow', textKey: 'quest.j03.wake' },
    { id: 'tablet', type: 'talk', target: 'note-j03-tablet', textKey: 'quest.j03.tablet' },
  ],
  rewards: [{ xp: 110 }, { giveGold: 25 }, { give: [{ itemId: 'healing-flask', count: 1 }] }],
};
