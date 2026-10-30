// Quest posts for the Dragonspine cast (spread into `POST_RULES`, quests/posts.ts, after Deepgate's). The two hunters in the hall
// stand on the interior's own posts (those anchors are defined by the interiors plugin, so the layout post is only the outside home).
import type { PostRule } from '../quests/posts';

export const DRAGONSPINE_POST_RULES: PostRule[] = [1, 2].map((n) => ({
  npcId: `lodge-hunter-${n + 4}`,
  home: `npc-post.lodge-hunter-${n + 4}`,
  posts: [{ when: { all: [] }, anchorId: `dragonspine.hall.hunter.${n}` }],
}));
