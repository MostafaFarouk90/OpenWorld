import type { QuestDef } from '../types';

/**
 * M08 Kneel Before the Boy. onStart opens the Keep door (`story.m08.keepOpen`, never cleared; thread 3a) and shows
 * the Favour tab. The audience is a branching dialogue that cannot be failed.
 */
export const m08: QuestDef = {
  id: 'm08',
  titleKey: 'quest.m08.title',
  summaryKey: 'quest.m08.summary',
  sequential: true,
  onStart: [
    { setFlag: 'story.m08.keepOpen', value: true },
    { setFlag: 'story.m08.favourTab', value: true },
  ],
  objectives: [
    { id: 'o1', type: 'talk', target: 'wystan', textKey: 'quest.m08.o1' },
    { id: 'o2', type: 'goTo', target: 'trg.harrowmark.keep-hall', textKey: 'quest.m08.o2' },
    { id: 'o3', type: 'talk', target: 'edric', textKey: 'quest.m08.o3' },
    { id: 'o4', type: 'talk', target: 'wystan', textKey: 'quest.m08.o4' },
  ],
  rewards: [{ xp: 400 }, { give: [{ itemId: 'halvard-signet', count: 1 }] }],
};
