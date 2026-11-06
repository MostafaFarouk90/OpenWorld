import type { QuestDef } from '../../../types';
import { ACT4_REWARDS_IDS } from './rewards';
import { interacts, reads, story } from '../../act2/helpers';

/** L0's sequencer scene at the camp: Edric grieves, the allies arrive, the map comes out. */
export const M41_CAMP_SCENE = 'm41.camp';
export const M41_GATHERED = 'story.m41.gathered';
export const M41_MAP = 'use:m41-map';
export const M41_FIRE = 'use:m41-fire';
export const M41_NOTES = ['note-m41-grandfather', 'note-m41-tunnel'] as const;
/** Everyone the camp scene brings out of the city: they stand at the camp until M41 completes (then the refuge rows take them). */
export const M41_ARRIVALS = ['wystan', 'merrin', 'wenna', 'dunstan', 'stane', 'pennard', 'gerta', 'ashdown'] as const;

/**
 * M41 The Boy King Remembers (plan 3). At the camp outside the north wall: the gathering scene, Edric (the grief and the
 * map), Rook, the map table and the fire, the grandfather's note and the tunnel mark, and Edric naming Ashgate. The Ash Road
 * opens on `story.m41.complete` (L0, L1).
 */
export const m41: QuestDef = {
  id: 'm41',
  titleKey: 'quest.m41.title',
  summaryKey: 'quest.m41.summary',
  sequential: true,
  startWhen: { quest: 'm40', state: 'completed' },
  objectives: [
    story('gather', 'quest.m41.gather', M41_GATHERED, { doneWhen: { flag: M41_GATHERED, equals: true } }),
    { id: 'edric', type: 'talk', target: 'edric', textKey: 'quest.m41.edric' },
    { id: 'rook', type: 'talk', target: 'rook', textKey: 'quest.m41.rook' },
    { id: 'wystan', type: 'talk', target: 'wystan', textKey: 'quest.m41.wystan' },
    interacts('camp', 'quest.m41.camp', [M41_MAP, M41_FIRE]),
    reads('search', 'quest.m41.search', M41_NOTES),
    { id: 'ashgate', type: 'talk', target: 'edric', textKey: 'quest.m41.ashgate' },
  ],
  rewards: [{ xp: 1000 }, { give: [{ itemId: ACT4_REWARDS_IDS.m41, count: 1 }] }],
};
