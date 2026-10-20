import type { QuestDef } from '../types';

export const R01_STAKES = ['use:r01-stake-1', 'use:r01-stake-2', 'use:r01-stake-3'];

/**
 * R01 Wynn's Scarecrows. A sword only knocks an ash scarecrow down; the torch or a Surge clears it, so the field
 * is never saved for free. The density pass: a scrap of mourning shawl on the fence says where the ash came from,
 * eight scarecrows over two fields, the root under the barley (three wraiths rise once the scarecrows are down), and
 * the aftermath the field's fate asks for. The field follows the majority of the clears, a tie saves it (bridges.ts
 * counts them and writes `story.r01.scorched` when the last scarecrow goes). Saved: re-stake three clean
 * scarecrows with Wynn. Scorched: beat out the stubble fire with two buckets. Either sets `story.r01.aftermathDone`.
 */
export const r01: QuestDef = {
  id: 'r01',
  titleKey: 'quest.r01.title',
  summaryKey: 'quest.r01.summary',
  sequential: true,
  objectives: [
    { id: 'o1', type: 'talk', target: 'wynn', textKey: 'quest.r01.o1' },
    { id: 'shawl', type: 'talk', target: 'note-r01-shawl', textKey: 'quest.r01.shawl' },
    { id: 'o2', type: 'event', target: 'scarecrow.cleared', dedupeBy: 'scarecrowId', required: 8, textKey: 'quest.r01.o2' },
    { id: 'root', type: 'kill', target: 'ash-wraith', required: 3, spawnTag: 'r01.root', textKey: 'quest.r01.root' },
    {
      id: 'aftermath', type: 'event', target: 'flag.changed', match: { key: 'story.r01.aftermathDone' },
      doneWhen: { flag: 'story.r01.aftermathDone' }, textKey: 'quest.r01.aftermath',
    },
    { id: 'o3', type: 'talk', target: 'wynn', textKey: 'quest.r01.o3' },
  ],
  onComplete: [
    {
      if: { flag: 'story.r01.scorched' },
      then: [{ setFlag: 'world.brightwater.barley', value: 'scorched' }],
      else: [{ setFlag: 'world.brightwater.barley', value: 'saved' }],
    },
  ],
  rewards: [{ xp: 250 }, { give: [{ itemId: 'barley-cake', count: 5 }] }],
};
