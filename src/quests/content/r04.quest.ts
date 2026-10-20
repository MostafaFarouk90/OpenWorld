import type { QuestDef } from '../types';

/** The three page props of the first build; only the first is still a prop (in the Archive stacks since the density pass). */
export const R04_PAGES = ['use:r04-page-1', 'use:r04-page-2', 'use:r04-page-3'];

/**
 * R04 The Archivist's Missing Pages. The expose or shield choice (favour swing, `story.r04.choice`) is Whitlock's
 * closing node. The density pass moves the pages indoors and gives each a scene: the first behind the stacks lock in
 * the Archive (Whitlock's key), the second from the chapel sexton, the third from a Guild fence (20 gold, or Gerta's
 * name). o2 is kept for saves made before: it is done once the three pages are (a save with old pages in hand is
 * credited past the new ones). Then Steward Crabbe on the Counting-House steps, and Whitlock reads the pages.
 */
export const r04: QuestDef = {
  id: 'r04',
  titleKey: 'quest.r04.title',
  summaryKey: 'quest.r04.summary',
  sequential: true,
  objectives: [
    { id: 'o1', type: 'talk', target: 'whitlock', textKey: 'quest.r04.o1' },
    { id: 'stacks', type: 'interact', target: 'use:r04-stacks-lock', textKey: 'quest.r04.stacks' },
    { id: 'page1', type: 'interact', target: 'use:r04-page-1', textKey: 'quest.r04.page1' },
    // the sexton and the fence hand over their pages in either order (their dialogues write the flags)
    { id: 'page2', type: 'event', target: 'r04.page', doneWhen: { flag: 'story.r04.page.2' }, textKey: 'quest.r04.page2' },
    { id: 'page3', type: 'event', target: 'r04.page', doneWhen: { flag: 'story.r04.page.3' }, textKey: 'quest.r04.page3' },
    {
      id: 'o2', type: 'event', target: 'r04.pages', required: 3,
      doneWhen: { all: ['page1', 'page2', 'page3'].map((o) => ({ objective: ['r04', o] as [string, string], done: true })) },
      textKey: 'quest.r04.o2',
    },
    { id: 'crabbe', type: 'talk', target: 'crabbe', textKey: 'quest.r04.crabbe' },
    { id: 'o3', type: 'talk', target: 'whitlock', textKey: 'quest.r04.o3' },
  ],
  rewards: [{ xp: 300 }, { give: [{ itemId: 'lore-tome-1', count: 1 }] }],
};
