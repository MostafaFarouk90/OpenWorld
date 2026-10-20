import type { Condition, QuestDef } from '../types';

const done = (o: string): Condition => ({ objective: ['m01', o], done: true });

/**
 * M01 Ash on the Wind: drive off the first wraiths, carry three villagers to the chapel, report to Gaut. The density
 * pass adds the Grey Goose door (two buckets from the well, and Tobb steps out), the mill (four wraiths, then the
 * miller), and Aelfreda's word on the rescued at her gate post. Objectives stay unordered; `when` keeps each scene
 * behind the one it follows, and Gaut's report waits for all of them.
 */
export const m01: QuestDef = {
  id: 'm01',
  titleKey: 'quest.m01.title',
  summaryKey: 'quest.m01.summary',
  objectives: [
    { id: 'o1', type: 'kill', target: 'ash-wraith', required: 5, spawnTag: 'm01', textKey: 'quest.m01.o1' },
    { id: 'o2', type: 'carry', target: 'm01.chapel-door', required: 3, textKey: 'quest.m01.o2' },
    { id: 'tavern', type: 'carry', target: 'm01.tavern-door', required: 2, textKey: 'quest.m01.tavern' },
    { id: 'tobb', type: 'talk', target: 'tobb', textKey: 'quest.m01.tobb', when: done('tavern') },
    { id: 'mill', type: 'kill', target: 'ash-wraith', required: 4, spawnTag: 'm01.mill', textKey: 'quest.m01.mill' },
    { id: 'miller', type: 'talk', target: 'aldwin', textKey: 'quest.m01.miller', when: done('mill') },
    { id: 'rescued', type: 'talk', target: 'aelfreda', textKey: 'quest.m01.rescued', when: done('o2') },
    {
      id: 'o3', type: 'talk', target: 'gaut', textKey: 'quest.m01.o3',
      when: { all: [done('o1'), done('o2'), done('tobb'), done('miller'), done('rescued')] },
    },
  ],
  rewards: [{ xp: 300 }, { give: [{ itemId: 'gauts-spare-blade', count: 1 }] }],
};
