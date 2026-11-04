// Quest posts for the Greyfen's movers (rows spread into `POST_RULES`, quests/posts.ts; none of these NPCs has an earlier
// row, so first match wins cleanly). Exactly one post holds at any state (revision 2 item 9, tested over every combination).
import type { PostRule } from '../quests/posts';
import { DESERTER_STOCKS_FLAG } from './flags';

const always = { all: [] };

export const GREYFEN_POST_RULES: PostRule[] = [
  {
    npcId: 'leofa',
    home: 'npc-post.leofa.reedgate',
    // Reedgate until M23 reaches the Mere (K12: the report is taken at her post there); at the Mere while M26 and M27 run;
    // otherwise Greywatch, where she trains Pathfinders and gives R14.
    posts: [
      { when: { quest: 'm27', state: 'active' }, anchorId: 'npc-post.leofa.mere' },
      { when: { quest: 'm26', state: 'active' }, anchorId: 'npc-post.leofa.mere' },
      { when: { all: [{ quest: 'm23', state: 'active' }, { objective: ['m23', 'sight'], done: true }] }, anchorId: 'npc-post.leofa.mere' },
      { when: { quest: 'm23', state: 'completed' }, anchorId: 'npc-post.leofa.greywatch' },
    ],
  },
  // Gytha brews at her cauldron inside the hut while M25 runs (the interior defines the post); she waits at the chapel door for
  // R13, at the Mere for M26 and at the Deeps door for D05 (K12's anchors beside K3's), else at the hut.
  {
    npcId: 'gytha',
    home: 'npc-post.gytha.hut',
    posts: [
      { when: { quest: 'm25', state: 'active' }, anchorId: 'npc-post.gytha.inside' },
      // M26 first: with both open she waits at the Mere, where M26's talks and hand-in are (R13's brief is taken before it)
      { when: { quest: 'm26', state: 'active' }, anchorId: 'greyfen.m26.gytha' },
      { when: { quest: 'r13', state: 'active' }, anchorId: 'greyfen.r13.gytha' },
      { when: { quest: 'd05', state: 'active' }, anchorId: 'greyfen.d05.gytha' },
      { when: { all: [{ quest: 'm27', state: 'completed' }, { not: { quest: 'd05', state: 'completed' } }] }, anchorId: 'greyfen.d05.gytha' },
    ],
  },
  // The deserter stands in the stocks once R14 returns him.
  { npcId: 'deserter', home: 'npc-post.deserter.camp', posts: [{ when: { flag: DESERTER_STOCKS_FLAG }, anchorId: 'npc-post.deserter.stocks' }] },
  // The bell keeper's post is in the chapel porch (an interior anchor), so the layout home is only the door outside.
  { npcId: 'bell-keeper', home: 'npc-post.bell-keeper.door', posts: [{ when: always, anchorId: 'npc-post.bell-keeper.chapel' }] },
];
