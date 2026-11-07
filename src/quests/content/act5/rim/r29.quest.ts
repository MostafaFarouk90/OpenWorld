import type { ObjectiveDef, QuestDef } from '../../../types';
import { reads, story } from '../../act2/helpers';
import { TQ } from './ids';
import { rewardOf } from './rewards';

export const R29_POSTS = [1, 2, 3] as const;
export type R29Post = (typeof R29_POSTS)[number];
/** The gong's three parts, one at each stoker post. */
export const R29_PARTS = { 1: 'hammer', 2: 'rope', 3: 'wedge' } as const satisfies Record<R29Post, string>;
export const R29_GHOST = (n: R29Post): string => `r29-stoker-${n}`;
export const R29_DEAD = (n: R29Post): string => `r29.dead.${n}`;
export const R29_DEAD_ARM = (n: R29Post): string => `story.r29.dead${n}Armed`;
export const R29_DEAD_DOWN = (n: R29Post): string => `story.r29.dead${n}Down`;
export const R29_NOTE = (n: R29Post): string => `note-r29-post-${n}`;
/** The part, carried back to the gong frame (the shipped carry kit). */
export const R29_CARRY = (n: R29Post): string => `pickup:r29-${R29_PARTS[n]}`;
export const R29_DELIVERED = (n: R29Post): string => `story.r29.${R29_PARTS[n]}`;
export const R29_GONG_TRIGGER = `${TQ}.r29.gong`;
export const R29_HANG = 'use:r29-hang';
export const R29_STRIKE = 'use:r29-strike';
/** The rhythm run passed: the gong is struck (laid the rim's dead; from here M52's `gong` order is offered). */
export const R29_STRUCK = 'story.r29.struck';
export const R29_SCENE = 'scene-r29-gong';
export const R29_SOUNDED = 'story.r29.sounded';
export const ANSGAR = 'ansgar';

const post = (n: R29Post): ObjectiveDef[] => [
  { id: `ghost${n}`, type: 'talk', target: R29_GHOST(n), textKey: `quest.r29.ghost${n}` },
  reads(`search${n}`, `quest.r29.search${n}`, [R29_NOTE(n)]),
  story(`dead${n}`, `quest.r29.dead${n}`, R29_DEAD_DOWN(n), { doneWhen: { flag: R29_DEAD_DOWN(n), equals: true } }),
  { id: `carry${n}`, type: 'carry', target: R29_GONG_TRIGGER, textKey: `quest.r29.carry${n}` },
];

/**
 * R29 The Last Gong (plan 2.1, 2.7; plain, no choice). Ansgar, come by the Rim Beacon, at the camp: the rim's forge-gong is silent
 * and the stokers' dead walk. At each of three stoker posts a stoker's shade speaks, the part's place is searched, the dead there
 * are Released (Ashwalkers +1 each, the shipped mercy port) or laid low, and the part is carried back to the gong frame. The parts
 * are hung; the gong is struck in Ansgar's count (one rhythm run, the chime's widened window, the lesson after two misses); it
 * sounds; Ansgar. From then on the gong is one of M52's orders (N4 reads the quest's state).
 */
export const r29: QuestDef = {
  id: 'r29',
  titleKey: 'quest.r29.title',
  summaryKey: 'quest.r29.summary',
  sequential: true,
  startWhen: { quest: 'm49', state: 'completed' },
  objectives: [
    { id: 'brief', type: 'talk', target: ANSGAR, textKey: 'quest.r29.brief' },
    ...R29_POSTS.flatMap(post),
    { id: 'hang', type: 'interact', target: R29_HANG, textKey: 'quest.r29.hang' },
    story('strike', 'quest.r29.strike', R29_STRUCK, { doneWhen: { flag: R29_STRUCK, equals: true } }),
    story('sound', 'quest.r29.sound', R29_SOUNDED, { doneWhen: { flag: R29_SOUNDED, equals: true } }),
    { id: 'report', type: 'talk', target: ANSGAR, textKey: 'quest.r29.report' },
  ],
  rewards: rewardOf('r29', 650),
};
