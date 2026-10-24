import type { QuestDef } from '../../../../types';
import { reads, story } from '../../helpers';

export const D04_NOTES = ['note-d04-map', 'note-d04-marks-1', 'note-d04-marks-2', 'note-d04-marks-3', 'note-d04-ledger', 'note-d04-chalk'];
export const D04_BOSS = 'the-slagmaw';
/** A8's outcome flag: 'defeated' is the only value the Slagmaw ever takes (no mercy verb, no Spare). */
export const D04_OUTCOME_FLAG = `boss.${D04_BOSS}.outcome`;
/** Arms A8's arena trigger. Written by the director when the arena objective becomes current, never on accept. */
export const D04_STARTED = 'story.d04.started';
export const D04_POOL_IDS = ['d04.pool-1', 'd04.pool-2'] as const;
export const D04_POOL_FLAGS = ['story.d04.pool1', 'story.d04.pool2'] as const;
export const D04_STAGE_TRIGGERS = ['trg.q13.d04.stage1', 'trg.q13.d04.stage2'] as const;

/**
 * D04 The Deepdelve Descent. Slagg sends Cael down the lift in two stages, through the crawlers and a cinder golem, to
 * the survey marks and the two valve rooms whose pools must be cooled, and on to the Slagmaw's arena. The Slagmaw has no
 * mercy outcome: `boss.defeated` credits the arena objective (and the outcome flag does on a load). Unlike the other
 * quests `story.d04.started` is not written on accept: it arms the one-shot arena, so the director writes it when the
 * arena objective becomes current.
 */
export const d04: QuestDef = {
  id: 'd04',
  titleKey: 'quest.d04.title',
  summaryKey: 'quest.d04.summary',
  sequential: true,
  startWhen: { quest: 'm20', state: 'completed' },
  objectives: [
    { id: 'brief', type: 'talk', target: 'slagg', textKey: 'quest.d04.brief' },
    { id: 'stage1', type: 'goTo', target: D04_STAGE_TRIGGERS[0], textKey: 'quest.d04.stage1' },
    { id: 'stage2', type: 'goTo', target: D04_STAGE_TRIGGERS[1], textKey: 'quest.d04.stage2' },
    { id: 'crawlersA', type: 'kill', target: 'slag-crawler', required: 10, spawnTag: 'd04.crawlers-a', textKey: 'quest.d04.crawlersA' },
    { id: 'golem', type: 'kill', target: 'cinder-golem', required: 1, spawnTag: 'd04.golem', textKey: 'quest.d04.golem' },
    { id: 'crawlersB', type: 'kill', target: 'slag-crawler', required: 3, spawnTag: 'd04.crawlers-b', textKey: 'quest.d04.crawlersB' },
    reads('survey', 'quest.d04.survey', D04_NOTES),
    story('pool1', 'quest.d04.pool1', 'puzzle.solved', { match: { id: D04_POOL_IDS[0] }, doneWhen: { flag: D04_POOL_FLAGS[0], equals: true } }),
    story('pool2', 'quest.d04.pool2', 'puzzle.solved', { match: { id: D04_POOL_IDS[1] }, doneWhen: { flag: D04_POOL_FLAGS[1], equals: true } }),
    story('slagmaw', 'quest.d04.slagmaw', 'boss.defeated', { match: { bossId: D04_BOSS }, doneWhen: { flag: D04_OUTCOME_FLAG, equals: 'defeated' } }),
    { id: 'report', type: 'talk', target: 'slagg', textKey: 'quest.d04.report' },
  ],
  rewards: [{ xp: 900 }, { give: [{ itemId: 'slag-core', count: 1 }] }],
};
