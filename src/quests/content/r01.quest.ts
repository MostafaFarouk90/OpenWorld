import type { QuestDef } from '../types';

/**
 * R01 Wynn's Scarecrows. A sword only knocks an ash scarecrow down; the torch or a Surge clears it, so the field
 * is never saved for free. The bridge in bridges.ts sets `story.r01.torchUsed` on the first torch clear.
 */
export const r01: QuestDef = {
  id: 'r01',
  titleKey: 'quest.r01.title',
  summaryKey: 'quest.r01.summary',
  sequential: true,
  objectives: [
    { id: 'o1', type: 'talk', target: 'wynn', textKey: 'quest.r01.o1' },
    { id: 'o2', type: 'event', target: 'scarecrow.cleared', dedupeBy: 'scarecrowId', required: 6, textKey: 'quest.r01.o2' },
    { id: 'o3', type: 'talk', target: 'wynn', textKey: 'quest.r01.o3' },
  ],
  onComplete: [
    {
      if: { flag: 'story.r01.torchUsed' },
      then: [{ setFlag: 'world.brightwater.barley', value: 'scorched' }],
      else: [{ setFlag: 'world.brightwater.barley', value: 'saved' }],
    },
  ],
  rewards: [{ xp: 250 }, { give: [{ itemId: 'barley-cake', count: 5 }] }],
};
