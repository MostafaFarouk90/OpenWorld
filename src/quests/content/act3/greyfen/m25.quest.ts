import type { QuestDef } from '../../../types';
import { reads, story } from '../../act2/helpers';

export const M25_HERBS = ['bog-myrtle', 'sundew', 'mire-lily'] as const;
export const M25_FIND = ['note-m25-myrtle', 'note-m25-sundew', 'note-m25-lily'];
export const M25_SHELF = 'note-m25-shelf';
export const M25_PICKS = M25_HERBS.map((_, i) => `use:m25-herb-${i + 1}`);
export const M25_POTS = ['use:m25-pot-1', 'use:m25-pot-2', 'use:m25-pot-3'];
export const M25_POT_FLAGS = ['story.m25.pot1', 'story.m25.pot2', 'story.m25.pot3'];
export const M25_BEDS_TAG = 'm25.beds';
export const M25_BEDS_FLAG = 'story.m25.bedsOut';
export const M25_BREWED = 'story.m25.brewed';
export const M25_DRUNK = 'story.m25.drunk';

const herb = (i: number) => reads(`find${i + 1}`, `quest.m25.find${i + 1}`, [M25_FIND[i]]);
const pick = (i: number) => ({ id: `pick${i + 1}`, type: 'collect' as const, target: M25_HERBS[i], textKey: `quest.m25.pick${i + 1}` });

/**
 * M25 The Peat-Witch's Bargain. Gytha Mireweather will brew Cael a salve for the Burn if he fetches her three herbs: each
 * is found (a read) and picked (a collect), her shelf of old salves is read, a shambler and five leeches are cleared from
 * the herb beds, and at her cauldron three pots go in. The brew is the first salve (the economy brews it from the last pot);
 * Cael drinks it and the Burn drops 20 on screen. Gytha's warning is the last word.
 */
export const m25: QuestDef = {
  id: 'm25',
  titleKey: 'quest.m25.title',
  summaryKey: 'quest.m25.summary',
  sequential: true,
  startWhen: { quest: 'm24', state: 'completed' },
  objectives: [
    { id: 'brief', type: 'talk', target: 'gytha', textKey: 'quest.m25.brief' },
    { id: 'herb-cutter', type: 'talk', target: 'herb-cutter', textKey: 'quest.m25.cutter' },
    reads('shelf', 'quest.m25.shelf', [M25_SHELF]),
    { id: 'lore', type: 'talk', target: 'gytha', textKey: 'quest.m25.lore' },
    herb(0), pick(0), herb(1), pick(1), herb(2), pick(2),
    { id: 'shambler', type: 'kill', target: 'peat-shambler', required: 1, spawnTag: M25_BEDS_TAG, textKey: 'quest.m25.shambler' },
    { id: 'leeches', type: 'kill', target: 'fen-leech', required: 5, spawnTag: M25_BEDS_TAG, textKey: 'quest.m25.leeches' },
    { id: 'brew', type: 'event', target: 'interact', match: { interactableId: M25_POTS }, dedupeBy: 'interactableId', required: 3, textKey: 'quest.m25.brew' },
    story('drink', 'quest.m25.drink', 'story.m25.drink', { doneWhen: { flag: M25_DRUNK, equals: true } }),
    { id: 'warning', type: 'talk', target: 'gytha', textKey: 'quest.m25.warning' },
    { id: 'report', type: 'talk', target: 'gytha', textKey: 'quest.m25.report' },
  ],
  rewards: [{ xp: 600 }, { give: [{ itemId: 'fen-salve-recipe', count: 1 }] }],
};
