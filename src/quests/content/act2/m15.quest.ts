import type { QuestDef } from '../../types';
import { reads, story } from './helpers';

export const M15_READS = ['note-m15-ledger', 'note-m15-tally', 'note-m15-map'];
export const M15_KEYS = 'use:m15-cage-keys';
export const M15_FREE_CARTER = 'use:m15-free-carter';
export const M15_CAGE = 'use:m15-cage';

/**
 * M15 The Hunters' Pens. Osgar's scouts brief Cael; the camp is scouted unseen (stealth section `m15.camp`), the two
 * hunter packs are beaten (spared hunters count as witnesses), the ledgers read, the cage keys taken, the bound carter
 * and the doubting hunter heard, the carter freed and the cage opened; the wyrmling's first flight closes it.
 */
export const m15: QuestDef = {
  id: 'm15',
  titleKey: 'quest.m15.title',
  summaryKey: 'quest.m15.summary',
  sequential: true,
  startWhen: { quest: 'm14', state: 'completed' },
  objectives: [
    { id: 'brief', type: 'talk', target: 'osgar', textKey: 'quest.m15.brief' },
    story('scout', 'quest.m15.scout', 'stealth.section', { match: { sectionId: 'm15.camp', phase: 'cleared' } }),
    { id: 'spearmen', type: 'kill', target: 'hunter-spearman', required: 6, spawnTag: 'm15.pack', textKey: 'quest.m15.spearmen' },
    { id: 'harpooners', type: 'kill', target: 'hunter-harpooner', required: 2, spawnTag: 'm15.pack', textKey: 'quest.m15.harpooners' },
    reads('ledgers', 'quest.m15.ledgers', M15_READS),
    { id: 'keys', type: 'interact', target: M15_KEYS, textKey: 'quest.m15.keys' },
    { id: 'carter', type: 'talk', target: 'carter-bound', textKey: 'quest.m15.carter' },
    { id: 'doubter', type: 'talk', target: 'corwin', textKey: 'quest.m15.doubter' },
    { id: 'free', type: 'interact', target: M15_FREE_CARTER, textKey: 'quest.m15.free' },
    { id: 'cage', type: 'interact', target: M15_CAGE, textKey: 'quest.m15.cage' },
    story('flight', 'quest.m15.flight', 'story.m15.set'),
    { id: 'report', type: 'talk', target: 'osgar', textKey: 'quest.m15.report' },
  ],
  rewards: [{ xp: 500 }, { give: [{ itemId: 'wyrmling-scale', count: 1 }] }],
};
