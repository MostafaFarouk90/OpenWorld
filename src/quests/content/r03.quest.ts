import type { QuestDef } from '../types';

/**
 * R03 The Brewer's Debt. The outcome (`world.harrowmark.inn.price`: 'forgiven' | 'collected') is written by Aldith's
 * closing choice; collecting pays R03_COIN_GOLD, forgiving pays nothing and makes the rooms cheaper (thread 19).
 */
export const r03: QuestDef = {
  id: 'r03',
  titleKey: 'quest.r03.title',
  summaryKey: 'quest.r03.summary',
  sequential: true,
  objectives: [
    { id: 'o1', type: 'talk', target: 'aldith', textKey: 'quest.r03.o1' },
    { id: 'o2', type: 'kill', target: 'guildhall-thug', required: 3, spawnTag: 'r03.guildhall', textKey: 'quest.r03.o2' },
    { id: 'o3', type: 'interact', target: 'pickup:brewing-copper', textKey: 'quest.r03.o3' },
    { id: 'o4', type: 'talk', target: 'aldith', textKey: 'quest.r03.o4' },
  ],
  rewards: [{ xp: 300 }, { give: [{ itemId: 'aldiths-stout', count: 1 }] }],
};
