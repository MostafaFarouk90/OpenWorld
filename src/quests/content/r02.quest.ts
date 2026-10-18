import type { QuestDef } from '../types';

/**
 * R02 The Marshal's Last Drill: three challenges on the yard's blocking dummies, counted from thread 5's dummy events
 * (what counts as passing a challenge is quest data, so it is decided here): land three hits on an open dummy,
 * parry three attacks, break two guards.
 */
export const r02: QuestDef = {
  id: 'r02',
  titleKey: 'quest.r02.title',
  summaryKey: 'quest.r02.summary',
  sequential: true,
  objectives: [
    { id: 'o1', type: 'talk', target: 'stane', textKey: 'quest.r02.o1' },
    { id: 'o2', type: 'event', target: 'dummy.hitOpen', required: 3, textKey: 'quest.r02.o2' },
    { id: 'o3', type: 'event', target: 'dummy.parried', required: 3, textKey: 'quest.r02.o3' },
    { id: 'o4', type: 'event', target: 'dummy.guardBroken', required: 2, textKey: 'quest.r02.o4' },
    { id: 'o5', type: 'talk', target: 'stane', textKey: 'quest.r02.o5' },
  ],
  rewards: [{ xp: 250 }, { give: [{ itemId: 'training-weights', count: 1 }] }],
};
