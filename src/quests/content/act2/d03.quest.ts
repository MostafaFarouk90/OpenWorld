import type { QuestDef } from '../../types';
import { interacts, reads, story } from './helpers';

export const D03_GATE = ['use:d03-gate-1', 'use:d03-gate-2', 'use:d03-gate-3'];
export const D03_KEEP = ['note-d03-ledger', 'note-d03-seal', 'note-d03-letters', 'note-d03-manifest'];
export const D03_PRISONERS = ['use:d03-prisoner-1', 'use:d03-prisoner-2'];
const defeated = { flag: 'story.d03.outcome', equals: 'defeated' } as const;

/**
 * D03 The Fall of Scorchhold. Osgar's siege plan, the three charge points on the fort gate (hold F), the courtyard and
 * the wall harpooners, the four keep papers (`story.d03.started` is written when the keep objective becomes current:
 * it opens the keep door and arms A8's director), Hunt-Captain Redmane, the two caged prisoners freed after the fight,
 * his testimony if he was spared, and Osgar. No favour from the quest: the Spare hold pays Oswin +3 through BOSS_MERCY.
 */
export const d03: QuestDef = {
  id: 'd03',
  titleKey: 'quest.d03.title',
  summaryKey: 'quest.d03.summary',
  sequential: true,
  startWhen: { quest: 'm15', state: 'completed' },
  objectives: [
    { id: 'brief', type: 'talk', target: 'osgar', textKey: 'quest.d03.brief' },
    interacts('gate', 'quest.d03.gate', D03_GATE),
    { id: 'court', type: 'kill', target: 'hunter-spearman', required: 6, spawnTag: 'd03.court', textKey: 'quest.d03.court' },
    { id: 'yard', type: 'kill', target: 'hunter-harpooner', required: 2, spawnTag: 'd03.court', textKey: 'quest.d03.yard' },
    { id: 'perch', type: 'kill', target: 'hunter-harpooner', required: 3, spawnTag: 'd03.perch', textKey: 'quest.d03.perch' },
    reads('keep', 'quest.d03.keep', D03_KEEP),
    story('boss', 'quest.d03.boss', ['boss.defeated', 'boss.spared'], { match: { bossId: 'thrandil-redmane' } }),
    interacts('prisoners', 'quest.d03.prisoners', D03_PRISONERS),
    story('testimony', 'quest.d03.testimony', 'dialogue.ended', { match: { npcId: 'redmane', reason: 'completed' }, doneWhen: defeated }),
    { id: 'report', type: 'talk', target: 'osgar', textKey: 'quest.d03.report' },
  ],
  rewards: [{ xp: 800 }, { give: [{ itemId: 'redmanes-lance', count: 1 }] }],
};
