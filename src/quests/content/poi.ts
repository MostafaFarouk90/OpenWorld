// Leap-gated points of interest (design 4.3): a cache on the chapel ledge and a lore stone on the reed island.
// Thread 4 places the interactables; this table says what using them gives, once.
import type { Effect } from '../types';
import { LEDGE_CACHE_GOLD } from './gold';

export interface PoiReward {
  interactableId: string;
  /** set when taken; the reward never repeats, and it survives a reload */
  onceFlag: string;
  effects: Effect[];
  /** codex entry unlocked through the codex service (thread 8 owns its text) */
  codexId?: string;
}

export const POI_REWARDS: PoiReward[] = [
  {
    interactableId: 'use:poi-chapel-ledge',
    onceFlag: 'story.m03.ledgeTaken',
    effects: [
      { give: [{ itemId: 'healing-flask', count: 2 }, { itemId: 'barley-cake', count: 2 }] },
      { giveGold: LEDGE_CACHE_GOLD },
    ],
  },
  {
    interactableId: 'use:poi-reed-island',
    onceFlag: 'story.m03.reedRead',
    effects: [{ xp: 40 }],
    codexId: 'lore.reed-island',
  },
];
