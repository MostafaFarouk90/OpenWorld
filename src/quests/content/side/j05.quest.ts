import type { QuestDef } from '../../types';

/** Rook's board is read from M06 on (the sergeant takes the board once Cael is through the gate and at the Anvil). */
export const J05_START_WHEN = { quest: 'm06', state: 'completed' } as const;

/**
 * j05 Rook's Board: The Guild Hound (side job). A notice on the board by the Watch Barracks: Godric the Pie-Man's dog Crumb
 * slipped his rope in the Guild Quarter. Godric says where the dog likes to go; Cael looks at three places in turn, finds Crumb
 * waiting at the last (a conditional post keeps him there, then sends him home to the stall: src/quests/content/side/index.ts
 * SIDE_POST_RULES) and tells Godric.
 */
export const j05: QuestDef = {
  id: 'j05',
  titleKey: 'quest.j05.title',
  summaryKey: 'quest.j05.summary',
  sequential: true,
  startWhen: J05_START_WHEN,
  objectives: [
    { id: 'notice', type: 'talk', target: 'note-j05-notice', textKey: 'quest.j05.notice' },
    { id: 'owner', type: 'talk', target: 'stallholder-1', textKey: 'quest.j05.owner' },
    { id: 'search1', type: 'goTo', target: 'j05.search-1', textKey: 'quest.j05.search1' },
    { id: 'search2', type: 'goTo', target: 'j05.search-2', textKey: 'quest.j05.search2' },
    { id: 'search3', type: 'goTo', target: 'j05.search-3', textKey: 'quest.j05.search3' },
    { id: 'find', type: 'talk', target: 'crumb', textKey: 'quest.j05.find' },
    { id: 'report', type: 'talk', target: 'stallholder-1', textKey: 'quest.j05.report' },
  ],
  rewards: [{ xp: 55 }, { giveGold: 15 }],
};
