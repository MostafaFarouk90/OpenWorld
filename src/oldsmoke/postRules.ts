// Quest posts for Deepgate's cast (rows spread at the head of `POST_RULES`, quests/posts.ts: Slagg and Pike have no Act 1 rows,
// so first match wins cleanly). The hall's cast stands on the interior's own posts: those anchors are defined by the interiors
// plugin, so the layout post is only the outside home and an always-true row moves them in.
import type { PostRule } from '../quests/posts';

const always = { all: [] };
const range = (n: number) => Array.from({ length: n }, (_, i) => i + 1);

export const OLDSMOKE_POST_RULES: PostRule[] = [
  {
    npcId: 'slagg',
    home: 'npc-post.slagg.shaft',
    // R09 and R10 are given at the market; M17 and D04 at the shaft.
    posts: [{ when: { any: [{ quest: 'r09', state: 'active' }, { quest: 'r10', state: 'active' }] }, anchorId: 'npc-post.slagg.market' }],
  },
  { npcId: 'aldous', home: 'npc-post.aldous.court', posts: [{ when: always, anchorId: 'oldsmoke.hall.aldous' }] },
  // A13 takes Wenna over from M19 (she walks the player to the Lower Galleries), so the director leaves her alone then.
  {
    npcId: 'wenna',
    home: 'npc-post.wenna.court',
    posts: [{ when: always, anchorId: 'oldsmoke.hall.wenna' }],
    leaveWhen: { quest: 'm19', state: ['active', 'completed'] },
  },
  ...range(4).map((n) => ({
    npcId: `steward-hall-${n}`,
    home: `npc-post.steward-hall.${n}`,
    posts: [{ when: always, anchorId: `oldsmoke.hall.steward.${n}` }],
  })),
];
