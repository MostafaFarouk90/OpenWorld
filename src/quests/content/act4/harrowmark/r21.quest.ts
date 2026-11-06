import type { QuestDef } from '../../../types';
import { ACT4_REWARDS_IDS } from './rewards';
import { reads, story } from '../../act2/helpers';
import { ACT4_SPAWN_FLAGS } from '../../../../harrowmark/act4/spawners';

/** F6: `all` (G +6) or `leaders` (G +2). */
export const R21_CHOICE = 'story.r21.choice';
export type R21Way = 'all' | 'leaders';
export const R21_ALL_FLAG = ACT4_SPAWN_FLAGS.r21All;
/** Leaders: one group of three. All: two groups of four (the taste call: eight walk, twelve stand at the refuge later). */
export const R21_GROUPS: Readonly<Record<R21Way, readonly (readonly string[])[]>> = {
  leaders: [['miner.1', 'miner.2', 'miner.3']],
  all: [['miner.1', 'miner.2', 'miner.3', 'miner.4'], ['miner.5', 'miner.6', 'miner.7', 'miner.8']],
};
export const R21_ESCORT = (group: number): string => `r21.miners-${group}`;
export const R21_OUT = 'story.r21.out';
/** Group 1 of `all` is out (the second group then starts from the cellars). */
export const R21_FIRST_OUT = 'story.r21.firstOut';
export const R21_SECTION = 'r21.lanes';
export const R21_PATROL_GROUPS = ['r21.cellars', 'r21.cellars.all'] as const;
export const R21_PATROL_DOWN = 'story.r21.patrolDown';
export const R21_DOOR = 'use:r21-cellar-door';
export const R21_GRATE = 'use:r21-grate';
export const R21_GRATE_FLAG = 'story.r21.grateOpen';
export const R21_NOTES = ['note-r21-cellar', 'note-r21-chalk'] as const;
export const R21_KEEPER = 'cellar-keeper';

/**
 * R21 Grisel's Daughter (plan 2.7). Wenna's loyal miners go out through the Guild Quarter's cellars and back lanes (L2: an
 * exterior route) to the sewer grate at the river wall. Cael scouts the lanes unseen, breaks the cellar patrol, opens the grate,
 * then walks the miners out on L4's escort: the leaders (one group) or all of them (two groups and the second patrol group).
 */
export const r21: QuestDef = {
  id: 'r21',
  titleKey: 'quest.r21.title',
  summaryKey: 'quest.r21.summary',
  sequential: true,
  startWhen: { quest: 'm36', state: 'completed' },
  objectives: [
    { id: 'brief', type: 'talk', target: 'wenna', textKey: 'quest.r21.brief' },
    { id: 'keeper', type: 'talk', target: R21_KEEPER, textKey: 'quest.r21.keeper' },
    { id: 'door', type: 'interact', target: R21_DOOR, textKey: 'quest.r21.door' },
    reads('cellar', 'quest.r21.cellar', [R21_NOTES[0]]),
    story('lanes', 'quest.r21.lanes', 'stealth.section', { match: { sectionId: R21_SECTION, phase: 'cleared' }, doneWhen: { flag: 'story.r21.lanesCrossed', equals: true } }),
    story('patrol', 'quest.r21.patrol', R21_PATROL_DOWN, { doneWhen: { flag: R21_PATROL_DOWN, equals: true } }),
    reads('chalk', 'quest.r21.chalk', [R21_NOTES[1]]),
    { id: 'grate', type: 'interact', target: R21_GRATE, textKey: 'quest.r21.grate' },
    story('out', 'quest.r21.out', R21_OUT, { doneWhen: { flag: R21_OUT, equals: true } }),
    { id: 'report', type: 'talk', target: 'wenna', textKey: 'quest.r21.report' },
  ],
  rewards: [{ xp: 550 }, { give: [{ itemId: ACT4_REWARDS_IDS.r21, count: 1 }] }],
};
