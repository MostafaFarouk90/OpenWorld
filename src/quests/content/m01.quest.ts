import type { QuestDef } from '../types';

/** M01 Ash on the Wind: drive off the first wraiths, carry three villagers to the chapel, report to Gaut. */
export const m01: QuestDef = {
  id: 'm01',
  titleKey: 'quest.m01.title',
  summaryKey: 'quest.m01.summary',
  objectives: [
    { id: 'o1', type: 'kill', target: 'ash-wraith', required: 5, spawnTag: 'm01', textKey: 'quest.m01.o1' },
    { id: 'o2', type: 'carry', target: 'm01.chapel-door', required: 3, textKey: 'quest.m01.o2' },
    {
      id: 'o3', type: 'talk', target: 'gaut', textKey: 'quest.m01.o3',
      when: { all: [{ objective: ['m01', 'o1'], done: true }, { objective: ['m01', 'o2'], done: true }] },
    },
  ],
  rewards: [{ xp: 300 }, { give: [{ itemId: 'gauts-spare-blade', count: 1 }] }],
};
