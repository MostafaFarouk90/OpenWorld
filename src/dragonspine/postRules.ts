// Quest posts for the Dragonspine cast (spread into `POST_RULES`, quests/posts.ts, after Deepgate's). The two hunters in the hall
// stand on the interior's own posts (those anchors are defined by the interiors plugin, so the layout post is only the outside home).
// PR 2, the midpoint: once `story.m34.complete` holds, all six lodge hunters stand at the gates and on the south-west tower facing
// out (`npc-post.lodge-hunter-N.out`, worldChanges.ts); first matching entry wins, so the outward post goes first. The posts are
// derived from the flag, so a load re-applies them either way.
import type { PostRule } from '../quests/posts';
import { M34_COMPLETE_FLAG } from './flags';

const outward = (n: number) => ({ when: { flag: M34_COMPLETE_FLAG }, anchorId: `npc-post.lodge-hunter-${n}.out` });

export const DRAGONSPINE_POST_RULES: PostRule[] = [
  ...[1, 2, 3, 4].map((n) => ({ npcId: `lodge-hunter-${n}`, home: `npc-post.lodge-hunter-${n}`, posts: [outward(n)] })),
  ...[1, 2].map((n) => ({
    npcId: `lodge-hunter-${n + 4}`,
    home: `npc-post.lodge-hunter-${n + 4}`,
    posts: [outward(n + 4), { when: { all: [] }, anchorId: `dragonspine.hall.hunter.${n}` }],
  })),
];
