import type { QuestDef } from '../../../types';
import { reads, story, nums } from '../../act2/helpers';

export const M24_HANDS = ['ferry-hand-1', 'ferry-hand-2'];
export const M24_SOUNDINGS = nums('note-m24-sounding-', 5);
export const M24_WRECK_TAG = 'm24.wreck';
export const M24_WRECK_FLAG = 'story.m24.wreckOut';
export const M24_HORN = 'use:m24-horn';
export const M24_BLOW = 'use:m24-blow';
export const M24_ITEM = 'm24-ferry-horn';
/** The dive pool's volume (K7: `water.greyfen.m24-pool`). */
export const M24_VOLUME = 'water.greyfen.m24-pool';
export const M24_DIVED = 'story.m24.dived';
export const M24_HORN_FLAG = 'story.m24.horn';
export const M24_SURFACED = 'story.m24.surfaced';
export const M24_BLOWN = 'story.m24.blown';
export const M24_FERRY_RUN = 'story.m24.ferryRun';
/** Dudda's pass for the first run: K7's ferry reads it beside the token (additive edit, listed in the PR). */
export const M24_FERRY_OPEN = 'story.m24.ferryOpen';
/** Any leg of the Reedgate routes counts as the first run (`ferry.greyfen.reedgate-mere` is the one K7 builds). */
export const M24_ROUTE_PREFIX = 'ferry.greyfen.reedgate';

/**
 * M24 The Ferryman's Fee. Dudda Reedly's ferry has lain idle since his horn was lost in the pool by the landing. Cael hears
 * Dudda, Hild, the ferry-hands and the widow, takes five soundings in the mud, clears the leeches round the wreck, dives the
 * fenced pool for the horn, blows it at the landing and makes the first run, then hands in. Plain quest: the token is the reward.
 */
export const m24: QuestDef = {
  id: 'm24',
  titleKey: 'quest.m24.title',
  summaryKey: 'quest.m24.summary',
  sequential: true,
  startWhen: { quest: 'm23', state: 'completed' },
  objectives: [
    { id: 'brief', type: 'talk', target: 'dudda', textKey: 'quest.m24.brief' },
    { id: 'hild', type: 'talk', target: 'hild', textKey: 'quest.m24.hild' },
    { id: 'hand1', type: 'talk', target: M24_HANDS[0], textKey: 'quest.m24.hand1' },
    { id: 'hand2', type: 'talk', target: M24_HANDS[1], textKey: 'quest.m24.hand2' },
    { id: 'widow', type: 'talk', target: 'widow', textKey: 'quest.m24.widow' },
    reads('soundings', 'quest.m24.soundings', M24_SOUNDINGS),
    { id: 'leeches', type: 'kill', target: 'fen-leech', required: 4, spawnTag: M24_WRECK_TAG, textKey: 'quest.m24.leeches' },
    story('dive', 'quest.m24.dive', 'dive.started', { match: { volumeId: M24_VOLUME }, doneWhen: { flag: M24_DIVED, equals: true } }),
    { id: 'horn', type: 'interact', target: M24_HORN, textKey: 'quest.m24.horn' },
    story('surface', 'quest.m24.surface', 'dive.surfaced', { match: { volumeId: M24_VOLUME }, doneWhen: { flag: M24_SURFACED, equals: true } }),
    { id: 'blow', type: 'interact', target: M24_BLOW, textKey: 'quest.m24.blow' },
    story('ferry', 'quest.m24.ferry', 'ferry.arrived', { doneWhen: { flag: M24_FERRY_RUN, equals: true } }),
    { id: 'report', type: 'talk', target: 'dudda', textKey: 'quest.m24.report' },
  ],
  rewards: [{ xp: 550 }, { give: [{ itemId: 'key.ferry-token', count: 1 }] }, { take: 'm24-ferry-horn' }],
};
