import type { QuestDef } from '../types';

/**
 * M03 Cold Embers: study the shard glow, learn the Surge Leap (V) and cross the chapel cliff, hear about Burn
 * and Scars, learn Release on the churchyard wraiths. Aelfreda's dialogue grants the Leap (behind o2) and
 * unlocks Release (during o5); no mercy is forced, a kill of the wraith credits o6 the same way.
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
      id: 'o3', type: 'event', target: 'ability.learned', match: { id: 'surge-leap' },
      doneWhen: { flag: 'ability.surge-leap.learned' }, textKey: 'quest.m03.o3',
    },
    { id: 'o4', type: 'goTo', target: 'trg.leap.chapel-ledge', textKey: 'quest.m03.o4' },
    { id: 'o5', type: 'talk', target: 'aelfreda', textKey: 'quest.m03.o5' },
    { id: 'o6', type: 'kill', target: 'ash-wraith', spawnTag: 'm03.churchyard', textKey: 'quest.m03.o6' },
    { id: 'o7', type: 'talk', target: 'aelfreda', textKey: 'quest.m03.o7' },
  ],
  rewards: [{ xp: 300 }, { skillPoints: 1 }],
};
