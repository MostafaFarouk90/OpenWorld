import type { QuestDef } from '../types';

/** Prior Aldhelm's prayer tablets (readable notes in the corridor and the ossuary). */
export const D01_TABLETS = [1, 2, 3, 4].map((n) => `note-d01-tablet-${n}`);
/** The antechamber's prayer braziers. */
export const D01_BRAZIERS = [1, 2, 3].map((n) => `use:d01-brazier-${n}`);

/**
 * D01 Prayers in the Vault. Either outcome completes it; the outcome lives in `boss.ashen-prior.outcome`
 * (written by the core boss registry), which Aelfreda's dialogue reads. Neither defeat nor release is required.
 * The density pass (batch 2): the vault door stays locked until D01 is taken (`story.d01.vaultOpen`); inside, Prior
 * Aldhelm's three prayer tablets, the antechamber's three braziers, which wake four wraiths from the walls, and the arena
 * gate that opens once they are down (`story.d01.antechamberClear`); after the outcome his censer, carried up and set on
 * the chapel altar, and a short vigil with Aelfreda that decides what goes in the record of him (`story.d01.prior`).
 */
export const d01: QuestDef = {
  id: 'd01',
  titleKey: 'quest.d01.title',
  summaryKey: 'quest.d01.summary',
  sequential: true,
  objectives: [
    { id: 'o1', type: 'event', target: 'interior.entered', match: { interiorId: 'chapel-vault' }, textKey: 'quest.d01.o1' },
    {
      id: 'tablets', type: 'event', target: 'dialogue.ended', match: { npcId: D01_TABLETS, reason: 'completed' },
      dedupeBy: 'npcId', required: 4, textKey: 'quest.d01.tablets',
    },
    {
      id: 'braziers', type: 'event', target: 'interact', match: { interactableId: D01_BRAZIERS }, dedupeBy: 'interactableId',
      required: 3, textKey: 'quest.d01.braziers',
    },
    { id: 'wake', type: 'kill', target: 'ash-wraith', required: 4, spawnTag: 'd01.antechamber', textKey: 'quest.d01.wake' },
    { id: 'o2', type: 'goTo', target: 'trg.vault.arena', textKey: 'quest.d01.o2' },
    {
      id: 'o3', type: 'event', target: ['boss.defeated', 'boss.released'], match: { bossId: 'ashen-prior' },
      doneWhen: { flag: 'boss.ashen-prior.outcome' }, textKey: 'quest.d01.o3',
    },
    { id: 'censer', type: 'talk', target: 'note-d01-censer', textKey: 'quest.d01.censer' },
    { id: 'o4', type: 'talk', target: 'aelfreda', textKey: 'quest.d01.o4' },
    { id: 'altar', type: 'interact', target: 'use:d01-altar', textKey: 'quest.d01.altar' },
    { id: 'vigil', type: 'talk', target: 'aelfreda', textKey: 'quest.d01.vigil' },
  ],
  rewards: [{ xp: 600 }, { give: [{ itemId: 'priors-censer', count: 1 }] }],
};
