import type { QuestDef } from '../../../types';
import { ACT4_REWARDS_IDS } from './rewards';
import { story } from '../../act2/helpers';
import { DEEP_RUN_ID } from '../../../../harrowmark/act4/sites';

export const M40_ESCORT = 'm40.deep-run';
export const M40_ENTERED = 'story.m40.entered';
export const M40_DENS = ['deeprun.hounds-1', 'deeprun.hounds-2'] as const;
export const M40_DEN_DOWN = (n: 1 | 2): string => `story.m40.den${n}Down`;
export const M40_SLUICE = 'use:m40-sluice';
export const M40_SLUICE_FLAG = 'story.m40.sluice';
export const M40_OUT = 'story.m40.out';
/** Edric's three courage beats, one at each junction (L4's `junctionDialogue`, spoken with Rook as the lead). */
export const M40_JUNCTION_SCENE = (n: 1 | 2 | 3): string => `scene-m40-junction-${n}`;
export const M40_RESPAWN_ID = 'm40.deeprun';

/**
 * M40 Flight Through the Underways (plan 3). Rook at the stair foot; the deep run with Edric and Rook on L4's escort (it stops
 * at the three junctions for Edric's courage beats); the two hound dens; the sluice wheel; the patrol hall (slipped or
 * fought, both pass); the ladder out beyond the north wall.
 */
export const m40: QuestDef = {
  id: 'm40',
  titleKey: 'quest.m40.title',
  summaryKey: 'quest.m40.summary',
  sequential: true,
  startWhen: { quest: 'm39', state: 'completed' },
  objectives: [
    { id: 'brief', type: 'talk', target: 'rook', textKey: 'quest.m40.brief' },
    story('enter', 'quest.m40.enter', 'interior.entered', { match: { interiorId: DEEP_RUN_ID }, doneWhen: { flag: M40_ENTERED, equals: true } }),
    story('den1', 'quest.m40.den1', M40_DEN_DOWN(1), { doneWhen: { flag: M40_DEN_DOWN(1), equals: true } }),
    { id: 'sluice', type: 'interact', target: M40_SLUICE, textKey: 'quest.m40.sluice' },
    story('den2', 'quest.m40.den2', M40_DEN_DOWN(2), { doneWhen: { flag: M40_DEN_DOWN(2), equals: true } }),
    story('out', 'quest.m40.out', 'escort.arrived', { match: { escortId: M40_ESCORT }, doneWhen: { flag: M40_OUT, equals: true } }),
  ],
  rewards: [{ xp: 1200 }, { give: [{ itemId: ACT4_REWARDS_IDS.m40, count: 1 }] }],
};
