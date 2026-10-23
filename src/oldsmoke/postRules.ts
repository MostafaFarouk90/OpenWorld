// Quest posts for Deepgate's cast (rows spread at the head of `POST_RULES`, quests/posts.ts: Slagg and Pike have no Act 1 rows,
// so first match wins cleanly). The hall's cast stands on the interior's own posts: those anchors are defined by the interiors
// plugin, so the layout post is only the outside home and a row moves them in (the hall stewards at once, Aldous and Wenna once M16 is done).
import type { PostRule } from '../quests/posts';
import { HALL_HOSTILE_FLAG } from './flags';

const always = { all: [] };
/** M16 is played at the forecourt (A13: Aldous at the court, the brazier in front of it); the hall is where he sits afterwards. */
const m16Done = { quest: 'm16', state: 'completed' } as const;
const range = (n: number) => Array.from({ length: n }, (_, i) => i + 1);

export const OLDSMOKE_POST_RULES: PostRule[] = [
  {
    npcId: 'slagg',
    home: 'npc-post.slagg.shaft',
    // R09 and R10 are given at the market; M17 at the shaft; D04 at Deepdelve once it is active.
    posts: [
      // D04 is given and finished at Deepdelve (the mine interior defines the post).
      { when: { quest: 'd04', state: 'active' }, anchorId: 'npc-post.slagg.deepdelve' },
      { when: { any: [{ quest: 'r09', state: 'active' }, { quest: 'r10', state: 'active' }] }, anchorId: 'npc-post.slagg.market' },
    ],
  },
  // Pike tends the Weeping Bellows once M18 starts.
  { npcId: 'pike', home: 'npc-post.pike.shaft', posts: [{ when: { quest: 'm18', state: ['active', 'completed'] }, anchorId: 'npc-post.pike.bellows' }] },
  { npcId: 'aldous', home: 'npc-post.aldous.court', posts: [{ when: m16Done, anchorId: 'oldsmoke.hall.aldous' }] },
  // A13 takes Wenna over while M19 or M20 is active (she walks the player to the Lower Galleries), so the director leaves her alone then.
  {
    npcId: 'wenna',
    home: 'npc-post.wenna.court',
    posts: [{ when: m16Done, anchorId: 'oldsmoke.hall.wenna' }],
    // M19 and M20 are A13's (the nursery, then the galleries); once both are done she is back at the hall for M21.
    leaveWhen: { any: [{ quest: 'm19', state: 'active' }, { quest: 'm20', state: 'active' }] },
  },
  ...range(4).map((n) => ({
    npcId: `steward-hall-${n}`,
    home: `npc-post.steward-hall.${n}`,
    posts: [{ when: always, anchorId: `oldsmoke.hall.steward.${n}` }],
    // While M21 is hostile the stewards are absent (their spec's `absentWhen`); the director must not keep trying to place them.
    leaveWhen: { flag: HALL_HOSTILE_FLAG },
  })),
];
