import type { Condition, QuestDef } from '../../../types';
import { reads, story } from '../helpers';

export const R10_NOTES = ['note-r10-ledgers', 'note-r10-injuries', 'note-r10-orders', 'note-r10-notice', 'note-r10-shift', 'note-r10-petition'];
const compromise: Condition = { flag: 'story.r10.branch', equals: 'compromise' };
const settled: Condition = { any: [{ flag: 'story.r10.branch', equals: 'miners' }, { flag: 'story.r10.branch', equals: 'stewards' }, compromise] };

/**
 * R10 The Miners' Strike. Slagg wants the strike won, the steward lead wants it broken. Cael hears both halls, reads what
 * each side has kept, and chooses. Miners or stewards: post the ruling and return the keys. Compromise: win all three
 * parties over with persuasion talks. `story.r10.choice` (which the market's guards read) is written last, at the report.
 */
export const r10: QuestDef = {
  id: 'r10',
  titleKey: 'quest.r10.title',
  summaryKey: 'quest.r10.summary',
  sequential: true,
  startWhen: { quest: 'm17', state: 'completed' },
  objectives: [
    { id: 'brief', type: 'talk', target: 'slagg', textKey: 'quest.r10.brief' },
    { id: 'miners', type: 'talk', target: 'miner-1', textKey: 'quest.r10.miners' },
    { id: 'stewards', type: 'talk', target: 'steward-market-1', textKey: 'quest.r10.stewards' },
    reads('read', 'quest.r10.read', R10_NOTES),
    story('choice', 'quest.r10.choice', 'story.r10.chosen', { doneWhen: settled }),
    story('ruling', 'quest.r10.ruling', 'interact', { match: { interactableId: 'use:r10-ruling' }, doneWhen: compromise }),
    story('keys', 'quest.r10.keys', 'interact', { match: { interactableId: 'use:r10-keys' }, doneWhen: compromise }),
    story('talks', 'quest.r10.talks', 'story.r10.persuaded', { required: 3, dedupeBy: 'n', doneWhen: { not: compromise } }),
    { id: 'report', type: 'talk', target: 'slagg', textKey: 'quest.r10.report' },
  ],
  rewards: [{ xp: 450 }, { give: [{ itemId: 'union-badge', count: 1 }] }],
};
