import type { QuestDef } from '../types';

/**
 * M05 Wardstones for the Dead Road. The density pass (batch 2) adds a pilgrim's journal under a toppled milestone halfway
 * along the road, the dead's last push at the Quenchstone after the fifth stone (four wraiths, gated on o1's objective
 * flag) and Tobb's bond scene at the lit shrine (`story.m05.tobbBond`, `story.m05.ballad`).
 * Tobb's intro dialogue starts it; starting it is the join choice, so
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
    { id: 'journal', type: 'talk', target: 'note-m05-journal', textKey: 'quest.m05.journal' },
    {
      id: 'o1', type: 'event', target: 'wardstones.complete',
      doneWhen: { flag: 'world.deadroad.wardstones.done' }, textKey: 'quest.m05.o1',
    },
    { id: 'push', type: 'kill', target: 'ash-wraith', required: 4, spawnTag: 'm05.shrine', textKey: 'quest.m05.push' },
    {
      id: 'o2', type: 'event', target: 'shrine.rekindled', match: { shrineId: 'quenchstone' },
      doneWhen: { flag: 'shrine.quenchstone.lit' }, textKey: 'quest.m05.o2',
    },
    { id: 'o3', type: 'talk', target: 'tobb', textKey: 'quest.m05.o3' },
  ],
  onComplete: [{ setFlag: 'story.m05.complete', value: true }],
  rewards: [{ xp: 300 }, { give: [{ itemId: 'tobbs-lucky-whistle', count: 1 }] }],
};
