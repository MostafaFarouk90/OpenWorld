import type { Condition, QuestDef } from '../../../types';
import { reads, story } from '../../act2/helpers';

export const R14_CHOICE = 'story.r14.choice';
export const R14_FAVOURED = 'story.r14.favoured';
export const R14_POSTS = [1, 2, 3, 4] as const;
export const R14_SIGNS = R14_POSTS.flatMap((p) => [1, 2].map((s) => `note-r14-sign-${p}-${s}`));
/** Each post's two signs, read together as one objective. */
export const R14_POST_SIGNS = (p: number): string[] => [`note-r14-sign-${p}-1`, `note-r14-sign-${p}-2`];
export const R14_RANGERS = ['greywatch-ranger-1', 'greywatch-ranger-2', 'greywatch-ranger-3'];
/** Ranger 3 is tied at post 3: Cael frees him with this prop before he will talk. */
export const R14_FREE = 'use:r14-free-ranger';
export const R14_FREED = 'story.r14.freed';
export const R14_LEECH_TAG = 'r14.leeches';
export const R14_PACK_TAG = 'r14.pack';
export const R14_LEECH_FLAG = 'story.r14.leechesOut';
export const R14_PACK_FLAG = 'story.r14.packOut';
export const R14_CHOSEN = 'story.r14.chosen';
const returned: Condition = { flag: R14_CHOICE, equals: 'returned' };
const released: Condition = { flag: R14_CHOICE, equals: 'released' };
export const R14_RESOLVED: Condition = { any: [returned, released] };

/**
 * R14 Leofa's Lost Patrol. Leofa Hartley at Greywatch sends Cael along the four ranger posts: each has two signs to read,
 * three missing rangers are found (the third is tied up and is freed first), three leeches and a hunter pack of four wait on
 * the way, and the deserter Wybert Fenn is found at the post 4 camp. Cael returns him to Greywatch or lets him go (the
 * choice is final and moves Halvard's favour: returned +4, released -2); the choice flag is read by K3's stocks and by M27.
 */
export const r14: QuestDef = {
  id: 'r14',
  titleKey: 'quest.r14.title',
  summaryKey: 'quest.r14.summary',
  sequential: true,
  startWhen: { quest: 'm23', state: 'completed' },
  objectives: [
    { id: 'brief', type: 'talk', target: 'leofa', textKey: 'quest.r14.brief' },
    reads('signs1', 'quest.r14.signs1', R14_POST_SIGNS(1)),
    { id: 'ranger1', type: 'talk', target: R14_RANGERS[0], textKey: 'quest.r14.ranger1' },
    reads('signs2', 'quest.r14.signs2', R14_POST_SIGNS(2)),
    { id: 'ranger2', type: 'talk', target: R14_RANGERS[1], textKey: 'quest.r14.ranger2' },
    reads('signs3', 'quest.r14.signs3', R14_POST_SIGNS(3)),
    { id: 'free', type: 'interact', target: R14_FREE, textKey: 'quest.r14.free' },
    { id: 'ranger3', type: 'talk', target: R14_RANGERS[2], textKey: 'quest.r14.ranger3' },
    { id: 'leeches', type: 'kill', target: 'fen-leech', required: 3, spawnTag: R14_LEECH_TAG, textKey: 'quest.r14.leeches' },
    reads('signs4', 'quest.r14.signs4', R14_POST_SIGNS(4)),
    { id: 'pack', type: 'kill', target: 'hunter-spearman', required: 3, spawnTag: R14_PACK_TAG, textKey: 'quest.r14.pack' },
    { id: 'harpooner', type: 'kill', target: 'hunter-harpooner', required: 1, spawnTag: R14_PACK_TAG, textKey: 'quest.r14.harpooner' },
    { id: 'deserter', type: 'talk', target: 'deserter', textKey: 'quest.r14.deserter' },
    story('choice', 'quest.r14.choice', 'story.r14.chosen', { doneWhen: R14_RESOLVED }),
    { id: 'report', type: 'talk', target: 'leofa', textKey: 'quest.r14.report' },
  ],
  rewards: [{ xp: 500 }, { give: [{ itemId: 'ranger-longbow', count: 1 }] }],
};
