import type { QuestDef } from '../../types';
import { interacts, reads, story } from './helpers';

export const M11_SEARCH = ['note-m11-waypost', 'note-m11-wreck', 'note-m11-courier', 'note-m11-scout'];
export const M11_BLOOMS = ['use:m11-bloom-1', 'use:m11-bloom-2', 'use:m11-bloom-3'];
export const M11_BANNER = 'use:m11-banner';

/**
 * M11 Road of Cinders. Gaut briefs Cael at the River Gate; raising the Halvard banner there sends the column out along
 * the Cinder Road (A5's escort). At the first dark waystone the column dismounts, two Footman ambushes come out of the
 * road dust, four spots along the way tell what happened to the courier, the blightbloom ring is cleansed (which wakes
 * its wraiths) and the stone is rekindled.
 */
export const m11: QuestDef = {
  id: 'm11',
  titleKey: 'quest.m11.title',
  summaryKey: 'quest.m11.summary',
  sequential: true,
  startWhen: { flag: 'story.gate.a2', equals: true },
  objectives: [
    { id: 'brief', type: 'talk', target: 'gaut', textKey: 'quest.m11.brief' },
    { id: 'banner', type: 'interact', target: M11_BANNER, textKey: 'quest.m11.banner' },
    { id: 'ring', type: 'goTo', target: 'trg.cinderreach.m11.ring', textKey: 'quest.m11.ring' },
    { id: 'ambush', type: 'kill', target: 'blighted-soldier', required: 6, spawnTag: 'm11.ambush', textKey: 'quest.m11.ambush' },
    reads('search', 'quest.m11.search', M11_SEARCH),
    interacts('blooms', 'quest.m11.blooms', M11_BLOOMS),
    { id: 'wraiths', type: 'kill', target: 'ash-wraith', required: 5, spawnTag: 'm11.wraith', textKey: 'quest.m11.wraiths' },
    // The stone fires its event once and has no lock: lit early (during the ambush, or on an earlier ride) it is credited
    // from its lit flag when this objective becomes current (review-a #2).
    story('stone', 'quest.m11.stone', 'waystone.rekindled', { match: { waystoneId: 'cinder-road' }, doneWhen: { flag: 'waystone.cinder-road.lit', equals: true } }),
    { id: 'report', type: 'talk', target: 'gaut', textKey: 'quest.m11.report' },
  ],
  rewards: [{ xp: 450 }, { give: [{ itemId: 'ashmare-saddle', count: 1 }] }],
};
