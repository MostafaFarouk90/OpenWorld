import type { QuestDef } from '../../../types';
import { reads, story } from '../helpers';

export const R09_OFFICE = ['note-r09-ledger', 'note-r09-safe', 'note-r09-seal', 'note-r09-stall', 'note-r09-board'];
export const R09_OFFICE_TRIGGER = 'trg.q13.r09.office';
/**
 * Raised by the last line of Slagg's R09 report. The report cannot be a `talk slagg`: the choice is made in a Slagg talk too,
 * so that talk's own end credited the report at once and the report scene never played (A13 smoke, live build).
 */
export const R09_REPORTED = 'story.r09.reported';

/**
 * R09 Sooty Coin. The payroll chests went down into the market cellars when the crawlers nested there. Clear the nests,
 * carry the chests to the paymaster's office, read what the office kept, hear the clerk and a miner, and choose: the
 * stewards get the coin back (Grisel +5) or the miners share it (Grisel -3, the union discount A10 reads).
 */
export const r09: QuestDef = {
  id: 'r09',
  titleKey: 'quest.r09.title',
  summaryKey: 'quest.r09.summary',
  sequential: true,
  startWhen: { quest: 'm16', state: 'completed' },
  objectives: [
    { id: 'brief', type: 'talk', target: 'slagg', textKey: 'quest.r09.brief' },
    { id: 'nests', type: 'kill', target: 'slag-crawler', required: 9, spawnTag: 'r09.nest', textKey: 'quest.r09.nests' },
    story('chests', 'quest.r09.chests', 'carry.delivered', { required: 3, match: { destinationId: R09_OFFICE_TRIGGER }, dedupeBy: 'carryId' }),
    reads('office', 'quest.r09.office', R09_OFFICE),
    // The clerk leaves the market when R10 ends on the miners' side (A4's post rule), so that case skips the talk.
    story('clerk', 'quest.r09.clerk', 'dialogue.ended', { match: { npcId: 'steward-market-2', reason: 'completed' }, doneWhen: { flag: 'story.r10.choice', equals: 'miners' } }),
    { id: 'miners', type: 'talk', target: 'miner-2', textKey: 'quest.r09.miners' },
    story('choice', 'quest.r09.choice', 'story.r09.chosen', { doneWhen: { any: [{ flag: 'story.r09.choice', equals: 'stewards' }, { flag: 'story.r09.choice', equals: 'miners' }] } }),
    story('report', 'quest.r09.report', R09_REPORTED),
  ],
  rewards: [{ xp: 400 }, { giveGold: 300 }],
};
