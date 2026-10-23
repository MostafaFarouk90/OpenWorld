import type { QuestDef } from '../../../../types';
import { interacts, reads, story } from '../../helpers';

export const M20_CHAINS = [1, 2, 3, 4, 5].map((n) => `use:m20-chain-${n}`);
/** The five searches of the gallery and the two top-up notes (plans/act2-A13.md section 5). */
export const M20_NOTES = [
  'note-m20-ledger', 'note-m20-key', 'note-m20-trough', 'note-m20-tally', 'note-m20-orders', 'note-m20-board', 'note-m20-scorch',
];
export const M20_STEWARD_TAG = 'm20.stewards';
/** One flag per chain: A6a's `wyrms.tether` posts read these and free their wyrmling (a freed one stays free across a load). */
export const M20_CHAIN_FLAGS = [1, 2, 3, 4, 5].map((n) => `story.m20.chain.${n}`);
/** Written on Orsk's `gone` beat (the skip emits it too); A4 rebuilds the gallery roof from it. */
export const M20_ORSK_GONE = 'story.m20.orskGone';
/** Raised once the captain has been talked to: the steward group spawns after Wenna's brief, not before. */
export const M20_STEWARDS_OUT = 'story.m20.stewardsOut';

/**
 * M20 Chain and Ember. Wenna leads Cael to the gallery under the Lower Galleries where the Grisel stewards keep chained
 * wyrmlings and, behind them, Orsk. Cael beats the eight stewards, hears their captain, breaks the five chains (in any
 * order; each sets its own flag), reads what the gallery kept and hears the keeper. The fifth chain brings Orsk down on
 * the roof: the set piece plays once (the director, not the objectives, runs it) and `story.m20.orskGone` credits the two
 * beats even if Cael was still reading when it played.
 */
export const m20: QuestDef = {
  id: 'm20',
  titleKey: 'quest.m20.title',
  summaryKey: 'quest.m20.summary',
  sequential: true,
  startWhen: { quest: 'm19', state: 'completed' },
  objectives: [
    { id: 'brief', type: 'talk', target: 'wenna', textKey: 'quest.m20.brief' },
    { id: 'stewards', type: 'kill', target: 'steward-guard', required: 8, spawnTag: M20_STEWARD_TAG, textKey: 'quest.m20.stewards' },
    { id: 'captain', type: 'talk', target: 'steward-captain', textKey: 'quest.m20.captain' },
    interacts('chains', 'quest.m20.chains', M20_CHAINS),
    reads('search', 'quest.m20.search', M20_NOTES),
    { id: 'keeper', type: 'talk', target: 'wyrmling-keeper', textKey: 'quest.m20.keeper' },
    story('chainsBroken', 'quest.m20.chainsBroken', 'wyrm.orsk', { match: { beat: 'chainsBroken' }, doneWhen: { flag: M20_ORSK_GONE, equals: true } }),
    story('gone', 'quest.m20.gone', 'wyrm.orsk', { match: { beat: 'gone' }, doneWhen: { flag: M20_ORSK_GONE, equals: true } }),
    { id: 'aftermath', type: 'talk', target: 'wenna', textKey: 'quest.m20.aftermath' },
  ],
  rewards: [{ xp: 600 }, { give: [{ itemId: 'orsks-cinder', count: 1 }] }],
};
