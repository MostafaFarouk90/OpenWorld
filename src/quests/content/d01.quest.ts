import type { QuestDef } from '../types';

/**
 * D01 Prayers in the Vault. Either outcome completes it; the outcome lives in `boss.ashen-prior.outcome`
 * (written by the core boss registry), which Aelfreda's dialogue reads. Neither defeat nor release is required.
 */
export const d01: QuestDef = {
  id: 'd01',
  titleKey: 'quest.d01.title',
  summaryKey: 'quest.d01.summary',
  sequential: true,
  objectives: [
    { id: 'o1', type: 'event', target: 'interior.entered', match: { interiorId: 'chapel-vault' }, textKey: 'quest.d01.o1' },
    { id: 'o2', type: 'goTo', target: 'trg.vault.arena', textKey: 'quest.d01.o2' },
    {
      id: 'o3', type: 'event', target: ['boss.defeated', 'boss.released'], match: { bossId: 'ashen-prior' },
      doneWhen: { flag: 'boss.ashen-prior.outcome' }, textKey: 'quest.d01.o3',
    },
    { id: 'o4', type: 'talk', target: 'aelfreda', textKey: 'quest.d01.o4' },
  ],
  rewards: [{ xp: 600 }, { give: [{ itemId: 'priors-censer', count: 1 }] }],
};
