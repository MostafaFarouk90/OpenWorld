import type { QuestDef } from '../../../types';
import { reads, story } from '../../act2/helpers';
import { rewardOf } from './rewards';

/** L1's chime puzzle: it emits this on success and sets the shrine flag once (plans/act4-L1.md section 17). */
export const CHIME_SOLVED_EVENT = 'waste.chime.solved';
export const SHRINE_LIT = 'shrine.singing-slag.lit';
export const M45_MET = 'story.m45.met';
/** L1's Glasslands trigger (radius 40 round the shrine). */
export const M45_MET_TRIGGER = 'trg.waste.glasslands';
export const M45_GUARD_GROUP = 'm45.glass';
export const M45_GUARD_ARM = 'story.m45.guardArmed';
export const M45_GUARD_DOWN = 'story.m45.guardDown';
export const M45_PLAQUES = ['note-m45-plaque-1', 'note-m45-plaque-2', 'note-m45-plaque-3'] as const;
export const M45_SEARCHES = ['note-m45-tally', 'note-m45-shard', 'note-m45-cracked'] as const;
/** Ulthred's voice through the glass, the first time it is heard (design 7.7). */
export const M45_VOICE_SCENE = 'scene-m45-voice';
export const M45_VOICE = 'story.m45.voice';

/**
 * M45 Chimes in the Glass (plan 2.7, design 7.7). Wulfhild hears Ebba's tune in the chime; at the Glasslands the guard comes
 * first, then the three Chime Key plaques and three searches, then L1's puzzle on the strike stone. Ulthred's voice sounds
 * through the glass; Wulfhild, waiting there, gives the Chime Key.
 */
export const m45: QuestDef = {
  id: 'm45',
  titleKey: 'quest.m45.title',
  summaryKey: 'quest.m45.summary',
  sequential: true,
  startWhen: { quest: 'm44', state: 'completed' },
  objectives: [
    { id: 'brief', type: 'talk', target: 'wulfhild', textKey: 'quest.m45.brief' },
    story('meet', 'quest.m45.meet', M45_MET, { doneWhen: { flag: M45_MET, equals: true } }),
    story('guard', 'quest.m45.guard', M45_GUARD_DOWN, { doneWhen: { flag: M45_GUARD_DOWN, equals: true } }),
    reads('plaques', 'quest.m45.plaques', M45_PLAQUES),
    reads('search', 'quest.m45.search', M45_SEARCHES),
    story('chime', 'quest.m45.chime', CHIME_SOLVED_EVENT, { doneWhen: { flag: SHRINE_LIT, equals: true } }),
    story('voice', 'quest.m45.voice', M45_VOICE, { doneWhen: { flag: M45_VOICE, equals: true } }),
    { id: 'report', type: 'talk', target: 'wulfhild', textKey: 'quest.m45.report' },
  ],
  rewards: rewardOf('m45', 900),
};
