import type { QuestDef } from '../../../types';
import { reads, story } from '../helpers';

export const M16_SEARCH = ['note-m16-ledger', 'note-m16-cart', 'note-m16-shrine'];
export const M16_BRAZIER = 'use:m16-brazier-1';
/** The scripted rekindle's id: not a waystone anchor (a tagged stone would be a respawn and travel point), only the event's name. */
export const M16_BRAZIER_ID = 'grisel-brazier';

/**
 * M16 Grisel's Invitation. Osgar's D03 hand-in hands Cael Aldous's letter; the pass is ridden to Deepgate with a hound
 * ambush and three places to read what the toll hides, the gate stewards check Cael, and Lord Aldous asks for proof the
 * shard is real: a dead brazier in the forecourt (A4's `oldsmoke.m16.brazier.1`), lit with the shipped rekindle's 10 Burn.
 */
export const m16: QuestDef = {
  id: 'm16',
  titleKey: 'quest.m16.title',
  summaryKey: 'quest.m16.summary',
  sequential: true,
  startWhen: { quest: 'd03', state: 'completed' },
  objectives: [
    { id: 'ride', type: 'goTo', target: 'trg.q13.m16.pass', textKey: 'quest.m16.ride' },
    reads('search', 'quest.m16.search', M16_SEARCH),
    { id: 'ambush', type: 'kill', target: 'ember-hound', required: 4, spawnTag: 'm16.ambush', textKey: 'quest.m16.ambush' },
    { id: 'gate', type: 'talk', target: 'steward-gate-1', textKey: 'quest.m16.gate' },
    { id: 'court', type: 'talk', target: 'aldous', textKey: 'quest.m16.court' },
    story('brazier', 'quest.m16.brazier', 'waystone.rekindled', { match: { waystoneId: M16_BRAZIER_ID } }),
    story('silence', 'quest.m16.silence', 'story.m16.silent'),
    { id: 'wenna', type: 'talk', target: 'wenna', textKey: 'quest.m16.wenna' },
    { id: 'report', type: 'talk', target: 'aldous', textKey: 'quest.m16.report' },
  ],
  rewards: [{ xp: 500 }, { give: [{ itemId: 'grisel-writ', count: 1 }] }],
};
