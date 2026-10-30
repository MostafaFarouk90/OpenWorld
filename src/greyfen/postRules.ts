// Quest posts for the Greyfen's movers (rows spread into `POST_RULES`, quests/posts.ts; none of these NPCs has an earlier
// row, so first match wins cleanly). Exactly one post holds at any state (revision 2 item 9, tested over every combination).
import type { PostRule } from '../quests/posts';
import { DESERTER_STOCKS_FLAG } from './flags';

const always = { all: [] };

export const GREYFEN_POST_RULES: PostRule[] = [
  {
    npcId: 'leofa',
    home: 'npc-post.leofa.reedgate',
    // Reedgate until M23 is done; at the Mere while M27 runs; otherwise Greywatch, where she trains Pathfinders.
    posts: [
      { when: { quest: 'm27', state: 'active' }, anchorId: 'npc-post.leofa.mere' },
      { when: { quest: 'm23', state: 'completed' }, anchorId: 'npc-post.leofa.greywatch' },
    ],
  },
  // Gytha brews at her cauldron inside the hut while M25 runs (the interior defines the post).
  { npcId: 'gytha', home: 'npc-post.gytha.hut', posts: [{ when: { quest: 'm25', state: 'active' }, anchorId: 'npc-post.gytha.inside' }] },
  // The deserter stands in the stocks once R14 returns him.
  { npcId: 'deserter', home: 'npc-post.deserter.camp', posts: [{ when: { flag: DESERTER_STOCKS_FLAG }, anchorId: 'npc-post.deserter.stocks' }] },
  // The bell keeper's post is in the chapel porch (an interior anchor), so the layout home is only the door outside.
  { npcId: 'bell-keeper', home: 'npc-post.bell-keeper.door', posts: [{ when: always, anchorId: 'npc-post.bell-keeper.chapel' }] },
];
