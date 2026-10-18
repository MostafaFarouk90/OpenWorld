import type { QuestDef } from '../types';

/** M02 A Mother's Bread: fetch the Brannoc hearth-stone from the bakery, then talk to Edda. */
export const m02: QuestDef = {
  id: 'm02',
  titleKey: 'quest.m02.title',
  summaryKey: 'quest.m02.summary',
  sequential: true,
  objectives: [
    { id: 'o1', type: 'goTo', target: 'm02.bakery', textKey: 'quest.m02.o1' },
    { id: 'o2', type: 'interact', target: 'pickup:hearth-stone', textKey: 'quest.m02.o2' },
    { id: 'o3', type: 'talk', target: 'edda', textKey: 'quest.m02.o3', when: { objective: ['m02', 'o2'], done: true } },
  ],
  rewards: [{ xp: 250 }, { give: [{ itemId: 'hearth-stone-charm', count: 1 }] }],
};
