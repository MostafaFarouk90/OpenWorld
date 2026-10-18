import type { QuestDef } from '../types';

/** T03: Walk the lane to Kettlewick and press F on three things. */
export const t03: QuestDef = {
  id: 't03',
  titleKey: 'quest.t03.title',
  summaryKey: 'quest.t03.summary',
  objectives: [
    { id: 'o1', type: 'interact', target: 'npc:stane', textKey: 'quest.t03.o1' },
    { id: 'o2', type: 'interact', target: 'npc:edda', textKey: 'quest.t03.o2' },
    { id: 'o3', type: 'interact', target: 'use:notice-board', textKey: 'quest.t03.o3' },
  ],
};
