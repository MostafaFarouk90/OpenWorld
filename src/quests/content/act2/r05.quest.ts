import type { QuestDef } from '../../types';
import { interacts, story } from './helpers';

export const R05_HOLLOWS = ['use:r05-hollow-1', 'use:r05-hollow-2', 'use:r05-hollow-3'];
export const R05_TRACKS = ['use:r05-track-1', 'use:r05-track-2', 'use:r05-track-3'];
const safe = { flag: 'story.r05.choice', equals: 'safe' } as const;

/**
 * R05 Ketta's Lost Flock. Search the three fog hollows and the tracks, talk to the shepherd boy, clear the hounds in
 * the fog, then choose: the safe road with the whole flock, or the Kindling Fox's shortcut (four stops, the Dell, six
 * sheep). The branch the player did not take is skipped by `doneWhen`. The director polls A6b's `herd.count` at the
 * fold and raises `story.r05.herdHome`.
 */
export const r05: QuestDef = {
  id: 'r05',
  titleKey: 'quest.r05.title',
  summaryKey: 'quest.r05.summary',
  sequential: true,
  startWhen: { quest: 'm12', state: 'completed' },
  objectives: [
    { id: 'brief', type: 'talk', target: 'ketta', textKey: 'quest.r05.brief' },
    interacts('hollows', 'quest.r05.hollows', R05_HOLLOWS),
    interacts('tracks', 'quest.r05.tracks', R05_TRACKS),
    { id: 'boy', type: 'talk', target: 'pell', textKey: 'quest.r05.boy' },
    { id: 'hounds', type: 'kill', target: 'ember-hound', required: 3, spawnTag: 'r05.fog', textKey: 'quest.r05.hounds' },
    story('choice', 'quest.r05.choice', 'story.r05.branched'),
    story('foxStops', 'quest.r05.foxStops', 'story.r05.foxStops', { doneWhen: safe }),
    story('dell', 'quest.r05.dell', 'interact', { match: { interactableId: 'use:r05-dell-stone' }, doneWhen: safe }),
    story('herdHome', 'quest.r05.herdHome', 'story.r05.herdHome'),
    { id: 'report', type: 'talk', target: 'ketta', textKey: 'quest.r05.report' },
  ],
  rewards: [{ xp: 350 }, { give: [{ itemId: 'fox-fire-ember', count: 1 }] }],
};
