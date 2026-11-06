// Act 4 posts of the existing Harrowmark cast (L2; plans/act4-L2.md section 3). From `story.gate.a4` until the city is Vey's
// (`story.m38.complete`) they stand at their Act 4 posts; Edric sits in the Council Chamber while M38 runs and Wystan musters at
// the Bastion while R19 runs. Rows go in front of each NPC's shipped rows (the first matching row wins), so nothing earlier
// changes before Act 4. Dunstan and Rook keep their Act 1 posts; Tobb is a companion (L4 owns his post).
import type { PostRule } from '../../quests/posts';
import type { Condition } from '../../quests/types';
import { postAnchor } from './act4.layout';
import { A4_FLAG, OCCUPIED_FLAG } from './sites';

/** Act 4 in the city: the gate flag holds and M38 is not done. */
export const ACT4_CITY: Condition = { all: [{ flag: A4_FLAG }, { not: { flag: OCCUPIED_FLAG } }] };
const during = (quest: string): Condition => ({ all: [ACT4_CITY, { quest, state: 'active' }] });

/** Rows to put in front of each NPC's posts; `home` is used only for an NPC with no shipped rule. */
export const ACT4_POST_ROWS: readonly { npcId: string; home: string; posts: PostRule['posts'] }[] = [
  {
    npcId: 'wystan',
    home: 'npc-post.wystan',
    posts: [
      { when: during('r19'), anchorId: postAnchor('wystan.bastion') },
      { when: ACT4_CITY, anchorId: postAnchor('wystan') },
    ],
  },
  {
    npcId: 'edric',
    home: 'npc-post.edric',
    posts: [
      { when: during('m38'), anchorId: 'harrowmark.a4.chamber.seat.edric' },
      { when: ACT4_CITY, anchorId: postAnchor('edric') },
    ],
  },
  { npcId: 'merrin', home: 'npc-post.merrin', posts: [{ when: ACT4_CITY, anchorId: postAnchor('merrin') }] },
  { npcId: 'wenna', home: 'npc-post.wenna.court', posts: [{ when: ACT4_CITY, anchorId: postAnchor('wenna') }] },
  { npcId: 'grisel-steward', home: 'npc-post.grisel', posts: [{ when: ACT4_CITY, anchorId: postAnchor('grisel-steward') }] },
];

/** The shipped rules with the Act 4 rows put first; an NPC without a rule gets one. Never reorders or drops a shipped row. */
export function withAct4Posts(rules: PostRule[]): PostRule[] {
  // Untouched rules keep their identity (other tables' tests find their rows in POST_RULES by reference).
  const out = [...rules];
  for (const row of ACT4_POST_ROWS) {
    const i = out.findIndex((r) => r.npcId === row.npcId);
    if (i >= 0) out[i] = { ...out[i]!, posts: [...row.posts, ...out[i]!.posts] };
    else out.push({ npcId: row.npcId, home: row.home, posts: [...row.posts] });
  }
  return out;
}

const ACT4_ROW_SET = new Set(ACT4_POST_ROWS.flatMap((r) => r.posts));

/** A rule with the Act 4 rows taken back out (for tables that pin their own shipped rows). */
export function withoutAct4Rows(rule: PostRule): PostRule {
  const posts = rule.posts.filter((p) => !ACT4_ROW_SET.has(p));
  return posts.length === rule.posts.length ? rule : { ...rule, posts };
}
