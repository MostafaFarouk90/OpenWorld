import type { Condition, QuestDef } from '../../../types';
import { reads, story } from '../../act2/helpers';
import { R30_LINE, R30_TUNE, R30_VERSE, R30_VERSES } from './flags';
import { NOT_DESCENDED, phaseJOpen } from './phase';
import { rewardOf } from './rewards';

/** The ten allies who give Tobb a line (plan 2.2): nine at the Rim Camp, Ysmeryth on the terraces. */
export const R30_ALLIES = ['wystan', 'merrin', 'wenna', 'wulfhild', 'rook', 'edric', 'hrolf', 'aelfreda', 'ansgar', 'ysmeryth'] as const;
export type R30Ally = (typeof R30_ALLIES)[number];
export const R30_LINE_EVENT = 'story.r30.lineGiven';
export const R30_PAGE = (n: number): string => `note-r30-page-${n}`;
export const R30_ANVIL = 'use:r30-anvil';
/** Ysmeryth is no NPC (she perches): her R30 line opens from a prop in front of her perch, N10's M51 talk spot. */
export const R30_YSMERYTH_USE = 'use:r30-talk-ysmeryth';
export const R30_YSMERYTH_SPOT = 'caldera.q.m51.talk.ysmeryth';
export const R30_CHOSEN_EVENT = 'story.r30.chosen';
export const R30_SUNG = 'story.r30.sung';

const done = (o: string): Condition => ({ objective: ['r30', o], done: true });
const briefed = done('brief');

/**
 * R30 Tobb's Ballad (plan 2.2 and 2.7, Q6). Tobb wants a line from every ally for the song of the Rim. Ten talks in any
 * order (each writes `story.r30.line.<npc>`), three pages the siege scattered, the tune drummed on the camp's anvil with Tobb
 * (one rhythm run, R13's assist), then the verse the ending song plays: `gaut`, `keepers`, `houses` or `walkers`.
 */
export const r30: QuestDef = {
  id: 'r30',
  titleKey: 'quest.r30.title',
  summaryKey: 'quest.r30.summary',
  sequential: false,
  startWhen: { all: [phaseJOpen(), NOT_DESCENDED] },
  objectives: [
    { id: 'brief', type: 'talk', target: 'tobb', textKey: 'quest.r30.brief' },
    story('lines', 'quest.r30.lines', R30_LINE_EVENT, {
      dedupeBy: 'npc', required: R30_ALLIES.length, when: briefed,
      doneWhen: { all: R30_ALLIES.map((a) => ({ flag: R30_LINE(a), equals: true })) },
    }),
    reads('pages', 'quest.r30.pages', [1, 2, 3].map(R30_PAGE), { when: briefed }),
    story('tune', 'quest.r30.tune', R30_TUNE, { doneWhen: { flag: R30_TUNE, equals: true }, when: { all: [done('lines'), done('pages')] } }),
    story('verse', 'quest.r30.verse', R30_CHOSEN_EVENT, { doneWhen: { any: R30_VERSES.map((v) => ({ flag: R30_VERSE, equals: v })) }, when: done('tune') }),
    story('sing', 'quest.r30.sing', R30_SUNG, { doneWhen: { flag: R30_SUNG, equals: true }, when: done('verse') }),
  ],
  rewards: rewardOf('r30'),
};
