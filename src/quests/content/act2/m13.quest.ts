import type { QuestDef } from '../../types';
import { reads, story } from './helpers';

export const M13_HALL = ['note-m13-shield', 'note-m13-cairn', 'note-m13-rune'];
export const M13_HEAVE = 'use:m13-heave';

/**
 * M13 The Warden's Oath. Hrolf's gate, his kin in the hall, three log laps to the ring, the test banter, a boulder heave,
 * the brothers' hall, A5's non-lethal trial (three breaks), and the oath. The oath scene and the hand-in are one
 * conversation; its last node writes `story.m13.hrolfJoined` and then sets his bond rank.
 */
export const m13: QuestDef = {
  id: 'm13',
  titleKey: 'quest.m13.title',
  summaryKey: 'quest.m13.summary',
  sequential: true,
  startWhen: { quest: 'm12', state: 'completed' },
  objectives: [
    { id: 'brief', type: 'talk', target: 'hrolf', textKey: 'quest.m13.brief' },
    { id: 'kin', type: 'talk', target: 'ealdred', textKey: 'quest.m13.kin' },
    { id: 'logs', type: 'carry', target: 'trg.q12.m13.logdrop', required: 3, textKey: 'quest.m13.logs' },
    { id: 'banter', type: 'talk', target: 'hrolf', textKey: 'quest.m13.banter' },
    { id: 'heave', type: 'interact', target: M13_HEAVE, textKey: 'quest.m13.heave' },
    reads('hall', 'quest.m13.hall', M13_HALL),
    story('duel', 'quest.m13.duel', 'trial.won', { match: { trialId: 'm13' } }),
    { id: 'oath', type: 'talk', target: 'hrolf', textKey: 'quest.m13.oath' },
  ],
  rewards: [{ xp: 500 }, { give: [{ itemId: 'hrolfs-axe-rune', count: 1 }] }],
};

