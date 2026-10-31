import type { QuestDef } from '../../types';

/**
 * j02 Edda's Bread Round (side job, offered by Edda once M02 is done). Take the basket from the bakery step, then a short
 * word at three doors in walking order: the widow Orla Pike at the lane's end, the miller Aldwin (at the chapel since M01) and
 * Sexton Osmund by the chapel. At Orla's
 * door Cael may leave the spare loaf or keep it (`story.j02.loaf` = left | kept); Edda remarks on it at the hand-in.
 */
export const j02: QuestDef = {
  id: 'j02',
  titleKey: 'quest.j02.title',
  summaryKey: 'quest.j02.summary',
  sequential: true,
  objectives: [
    { id: 'basket', type: 'interact', target: 'use:j02-basket', textKey: 'quest.j02.basket' },
    { id: 'orla', type: 'talk', target: 'orla', textKey: 'quest.j02.orla' },
    { id: 'aldwin', type: 'talk', target: 'aldwin', textKey: 'quest.j02.aldwin' },
    { id: 'osmund', type: 'talk', target: 'osmund', textKey: 'quest.j02.osmund' },
    { id: 'edda', type: 'talk', target: 'edda', textKey: 'quest.j02.edda' },
  ],
  rewards: [{ xp: 50 }, { giveGold: 12 }],
};
