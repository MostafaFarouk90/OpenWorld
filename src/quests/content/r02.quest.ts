import type { QuestDef } from '../types';

/** Where R02 runs: the Practice Yard before M06, the Halvard Bastion yard from M06 on (Stane moves there). */
export const R02_AT_BASTION = 'story.m06.started';

/**
 * R02 The Marshal's Last Drill: three challenges. First the yard's blocking dummies, counted from thread 5's dummy
 * events (what counts as passing is quest data, so it is decided here): land three hits on an open dummy, parry three
 * attacks, break two guards. Then (the density pass) a sparring bout with a yard veteran and one with two at once;
 * a veteran yields when beaten, and a Spare counts the same as a knock-down. Stane tells a story of the Marshal's war
 * between the challenges and a last one at the hand-in. The bouts stand where Stane stands (`R02_AT_BASTION`).
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
    { id: 'story1', type: 'talk', target: 'stane', textKey: 'quest.r02.story1' },
    { id: 'bout', type: 'kill', target: 'yard-veteran', spawnTag: 'r02.bout', textKey: 'quest.r02.bout' },
    { id: 'story2', type: 'talk', target: 'stane', textKey: 'quest.r02.story2' },
    { id: 'pair', type: 'kill', target: 'yard-veteran', required: 2, spawnTag: 'r02.pair', textKey: 'quest.r02.pair' },
    { id: 'o5', type: 'talk', target: 'stane', textKey: 'quest.r02.o5' },
  ],
  rewards: [{ xp: 250 }, { give: [{ itemId: 'training-weights', count: 1 }] }],
};
