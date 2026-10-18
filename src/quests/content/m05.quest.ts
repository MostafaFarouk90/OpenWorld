import type { QuestDef } from '../types';

/**
 * M05 Wardstones for the Dead Road. Tobb's intro dialogue starts it; starting it is the join choice, so
 * `story.m05.tobbJoined` (the single companion truth, read by thread 4b) is written once in onStart.
 * `story.m05.complete` is the fog wall's gate and is written once in onComplete.
 */
export const m05: QuestDef = {
  id: 'm05',
  titleKey: 'quest.m05.title',
  summaryKey: 'quest.m05.summary',
  sequential: true,
  onStart: [{ setFlag: 'story.m05.tobbJoined', value: true }],
  objectives: [
    {
      id: 'o1', type: 'event', target: 'wardstones.complete',
      doneWhen: { flag: 'world.deadroad.wardstones.done' }, textKey: 'quest.m05.o1',
    },
    {
      id: 'o2', type: 'event', target: 'shrine.rekindled', match: { shrineId: 'quenchstone' },
      doneWhen: { flag: 'shrine.quenchstone.lit' }, textKey: 'quest.m05.o2',
    },
    { id: 'o3', type: 'talk', target: 'tobb', textKey: 'quest.m05.o3' },
  ],
  onComplete: [{ setFlag: 'story.m05.complete', value: true }],
  rewards: [{ xp: 300 }, { give: [{ itemId: 'tobbs-lucky-whistle', count: 1 }] }],
};
