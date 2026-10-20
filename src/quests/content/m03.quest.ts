import type { QuestDef } from '../types';

/** The other places the shard's glow is read: two in Cael's voice, then the Hearthkeepers' record. */
export const M03_STUDIES = ['note-m03-font', 'note-m03-ember', 'note-m03-record'];

/**
 * M03 Cold Embers: study the shard glow, learn the Surge Leap (V) and cross the chapel cliff, hear about Burn
 * and Scars, learn Release on the churchyard wraiths. Aelfreda's dialogue grants the Leap (behind o2) and
 * unlocks Release (during o5); no mercy is forced, a kill of a wraith credits o6 the same way. The density pass adds
 * two more study points, the warding candle on the ledge (the Leap's reason), Brother Wulfric's grave, where a Scar is
 * shown rather than told, all four churchyard wraiths for o6, and a hand-in that asks what the first Release felt like.
 */
export const m03: QuestDef = {
  id: 'm03',
  titleKey: 'quest.m03.title',
  summaryKey: 'quest.m03.summary',
  sequential: true,
  objectives: [
    { id: 'o1', type: 'talk', target: 'aelfreda', textKey: 'quest.m03.o1' },
    { id: 'o2', type: 'interact', target: 'use:shard-study', textKey: 'quest.m03.o2' },
    {
      id: 'study', type: 'event', target: 'dialogue.ended', match: { npcId: M03_STUDIES, reason: 'completed' },
      dedupeBy: 'npcId', required: 3, textKey: 'quest.m03.study',
    },
    {
      id: 'o3', type: 'event', target: 'ability.learned', match: { id: 'surge-leap' },
      doneWhen: { flag: 'ability.surge-leap.learned' }, textKey: 'quest.m03.o3',
    },
    { id: 'o4', type: 'goTo', target: 'trg.leap.chapel-ledge', textKey: 'quest.m03.o4' },
    { id: 'candle', type: 'collect', target: 'warding-candle', textKey: 'quest.m03.candle' },
    { id: 'grave', type: 'talk', target: 'note-m03-wulfric', textKey: 'quest.m03.grave' },
    { id: 'o5', type: 'talk', target: 'aelfreda', textKey: 'quest.m03.o5' },
    { id: 'o6', type: 'kill', target: 'ash-wraith', required: 4, legacyRequired: 1, spawnTag: 'm03.churchyard', textKey: 'quest.m03.o6' },
    { id: 'o7', type: 'talk', target: 'aelfreda', textKey: 'quest.m03.o7' },
  ],
  rewards: [{ xp: 300 }, { skillPoints: 1 }],
};
