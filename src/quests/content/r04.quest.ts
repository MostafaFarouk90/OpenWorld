import type { QuestDef } from '../types';

export const R04_PAGES = ['use:r04-page-1', 'use:r04-page-2', 'use:r04-page-3'];

/** R04 The Archivist's Missing Pages. The expose or shield choice (favour swing, `story.r04.choice`) is Whitlock's closing node. */
export const r04: QuestDef = {
  id: 'r04',
  titleKey: 'quest.r04.title',
  summaryKey: 'quest.r04.summary',
  sequential: true,
  objectives: [
    { id: 'o1', type: 'talk', target: 'whitlock', textKey: 'quest.r04.o1' },
    {
      id: 'o2', type: 'event', target: 'interact', match: { interactableId: R04_PAGES }, dedupeBy: 'interactableId',
      required: 3, textKey: 'quest.r04.o2',
    },
    { id: 'o3', type: 'talk', target: 'whitlock', textKey: 'quest.r04.o3' },
  ],
  rewards: [{ xp: 300 }, { give: [{ itemId: 'lore-tome-1', count: 1 }] }],
};
