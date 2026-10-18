import type { QuestDef } from '../types';

/**
 * M10 Smoke Over the Rooftops. Gerta's go-node completes o1 itself (before the dialogue ends) so o2 is already current
 * when thread 18 starts the chase on `dialogue.ended`. `story.m10.ashmare` unlocks the mount (thread 20).
 */
export const m10: QuestDef = {
  id: 'm10',
  titleKey: 'quest.m10.title',
  summaryKey: 'quest.m10.summary',
  sequential: true,
  objectives: [
    { id: 'o1', type: 'talk', target: 'gerta', textKey: 'quest.m10.o1' },
    { id: 'o2', type: 'event', target: 'chase.started', match: { chaseId: 'm10.rooftops' }, textKey: 'quest.m10.o2' },
    { id: 'o3', type: 'event', target: 'chase.caught', match: { chaseId: 'm10.rooftops' }, textKey: 'quest.m10.o3' },
    { id: 'o4', type: 'talk', target: 'gerta', textKey: 'quest.m10.o4' },
  ],
  onComplete: [{ setFlag: 'story.m10.ashmare', value: true }],
  rewards: [{ xp: 400 }, { give: [{ itemId: 'couriers-cloak', count: 1 }] }],
};
