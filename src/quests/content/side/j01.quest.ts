import type { Condition, QuestDef } from '../../types';

const done = (o: string): Condition => ({ objective: ['j01', o], done: true });

/**
 * j01 Hob's Strayed Lambs (side job, offered by Hob once M02 is done). Three lambs sit where the day's warmth is: the
 * stubble-fire scar, the scarecrow field and the stepping stones of the lane drain. Each site is a goTo (the search) and the
 * lamb there is a carry pickup (the find); the fold is Hob's pen by the chapel waystone. Unordered, like M01; Hob's report
 * waits for the third lamb.
 */
export const j01: QuestDef = {
  id: 'j01',
  titleKey: 'quest.j01.title',
  summaryKey: 'quest.j01.summary',
  objectives: [
    { id: 'scar', type: 'goTo', target: 'j01.scar', textKey: 'quest.j01.scar' },
    { id: 'scarecrows', type: 'goTo', target: 'j01.scarecrows', textKey: 'quest.j01.scarecrows' },
    { id: 'ford', type: 'goTo', target: 'j01.ford', textKey: 'quest.j01.ford' },
    { id: 'lambs', type: 'carry', target: 'j01.fold', required: 3, textKey: 'quest.j01.lambs' },
    { id: 'report', type: 'talk', target: 'hob', textKey: 'quest.j01.report', when: done('lambs') },
  ],
  rewards: [{ xp: 70 }, { giveGold: 15 }],
};
