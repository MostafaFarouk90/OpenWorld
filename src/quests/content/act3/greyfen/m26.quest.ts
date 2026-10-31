import type { QuestDef } from '../../../types';
import { interacts, nums, reads, story } from '../../act2/helpers';

export const M26_NETS = nums('use:m26-net-', 4);
export const M26_NET_FLAGS = nums('story.m26.net.', 4);
export const M26_NETS_CUT = 'story.m26.netsCut';
export const M26_RITE_DONE = 'story.m26.riteDone';
export const M26_LIT = 'shrine.hathrens-mere.lit';
export const M26_SHRINE = 'hathrens-mere';
export const M26_SEARCHES = nums('note-m26-search-', 5);
export const M26_SCALE = 'use:m26-scale';
export const M26_SCALE_TAKEN = 'story.m26.scaleTaken';
export const M26_HUNTERS_TAG = 'm26.hunters';
export const M26_LEECHES_TAG = 'm26.leeches';
export const M26_NETGUARD_FLAG = 'story.m26.guardOut';
export const M26_GUARD_DOWN = 'story.m26.guardDown';
export const M26_WOKE = 'story.m26.woke';
export const M26_VOICE_NPC = 'scene.m26.voice';
export const M26_VOICE_SCENE = 'scene-m26-voice';

/**
 * M26 Quench-Tongue Wakes. Gytha takes Cael to Hathren's Mere, where hunters have netted the Quench-Tongue. Hathren wakes
 * (K6a's set piece), the net-cutters are beaten (four spearmen, a harpooner, three leeches), five things are read on the shore,
 * the four nets are cut (each writes `story.m26.net.N`; the fourth `story.m26.netsCut`), and the rite is paid at the shrine
 * (10 Burn: the shipped rekindle, `shrine.hathrens-mere.lit`). Hathren's voice is heard when she quiets, she dives and leaves
 * her scale, which Cael takes. Dragons +5 on completion.
 */
export const m26: QuestDef = {
  id: 'm26',
  titleKey: 'quest.m26.title',
  summaryKey: 'quest.m26.summary',
  sequential: true,
  startWhen: { quest: 'm25', state: 'completed' },
  onComplete: [{ favour: 'dragons', delta: 5 }],
  objectives: [
    { id: 'brief', type: 'talk', target: 'gytha', textKey: 'quest.m26.brief' },
    { id: 'mere', type: 'talk', target: 'gytha', textKey: 'quest.m26.mere' },
    { id: 'shore', type: 'talk', target: 'leofa', textKey: 'quest.m26.shore' },
    story('wake', 'quest.m26.wake', 'wyrm.hathren', { match: { beat: 'wake' }, doneWhen: { flag: M26_WOKE, equals: true } }),
    story('guards', 'quest.m26.guards', 'story.m26.guardDown', { doneWhen: { flag: M26_GUARD_DOWN, equals: true } }),
    reads('search', 'quest.m26.search', M26_SEARCHES),
    interacts('nets', 'quest.m26.nets', M26_NETS),
    story('rite', 'quest.m26.rite', 'shrine.rekindled', { match: { shrineId: M26_SHRINE }, doneWhen: { flag: M26_LIT, equals: true } }),
    { id: 'voice', type: 'talk', target: M26_VOICE_NPC, textKey: 'quest.m26.voice' },
    { id: 'scale', type: 'interact', target: M26_SCALE, textKey: 'quest.m26.scale' },
    { id: 'report', type: 'talk', target: 'gytha', textKey: 'quest.m26.report' },
  ],
  rewards: [{ xp: 650 }], // the scale itself is the pick-up at the scale bed (the prop gives it once)
};
