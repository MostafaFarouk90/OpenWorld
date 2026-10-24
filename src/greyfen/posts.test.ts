// The Greyfen's post rules (revision 2 item 9): one table, exactly one post for each mover at every quest state.
import { describe, expect, it } from 'vitest';
import type { ConditionEnv } from '../quests/ports';
import { POST_RULES, resolvePosts } from '../quests/posts';
import type { QuestState } from '../quests/types';
import { CHAPEL_DEF } from './chapelInterior';
import { DESERTER_STOCKS_FLAG } from './flags';
import { GREYFEN_LAYOUT } from './greyfen.layout';
import { HUT_DEF } from './hutInterior';
import { GREYFEN_NPCS } from './npcDefs';
import { GREYFEN_POST_RULES } from './postRules';

function env(quests: Record<string, QuestState> = {}, flags: Record<string, string | boolean | number> = {}): ConditionEnv {
  return {
    state: { getFlag: (k: string) => flags[k] } as never,
    quests: { state: (id: string) => quests[id] ?? 'inactive', objectiveDone: () => false } as never,
  };
}
const at = (npc: string, e: ConditionEnv) => resolvePosts(POST_RULES, e)[npc]!.anchorId;
const STATES: QuestState[] = ['inactive', 'active', 'completed', 'failed'];
const layoutAnchors = new Set(GREYFEN_LAYOUT.anchors.map((a) => a.id));
const interiorAnchors = new Set([...CHAPEL_DEF.anchors, ...HUT_DEF.anchors].map((a) => a.id));

describe('Greyfen NPC posts', () => {
  it('are spread into POST_RULES, name only anchors that exist, and move only Greyfen NPCs', () => {
    for (const r of GREYFEN_POST_RULES) expect(POST_RULES).toContain(r);
    const ours = new Set(GREYFEN_NPCS.map((n) => n.id));
    for (const r of GREYFEN_POST_RULES) {
      expect(ours.has(r.npcId), r.npcId).toBe(true);
      expect(layoutAnchors.has(r.home), r.home).toBe(true);
      for (const p of r.posts) expect(layoutAnchors.has(p.anchorId) || interiorAnchors.has(p.anchorId), p.anchorId).toBe(true);
    }
    // No other row names one of ours (first match would be ambiguous).
    const others = POST_RULES.filter((r) => !GREYFEN_POST_RULES.includes(r));
    for (const r of others) expect(ours.has(r.npcId), r.npcId).toBe(false);
  });

  it('puts Leofa at exactly one post for every M23 x M27 state: Reedgate, then Greywatch, the Mere while M27 runs', () => {
    for (const m23 of STATES) {
      for (const m27 of STATES) {
        const post = at('leofa', env({ m23, m27 }));
        const want = m27 === 'active' ? 'npc-post.leofa.mere' : m23 === 'completed' ? 'npc-post.leofa.greywatch' : 'npc-post.leofa.reedgate';
        expect(post, `m23 ${m23}, m27 ${m27}`).toBe(want);
      }
    }
  });

  it('moves Gytha inside for M25, the deserter to the stocks once returned, the bell keeper into the porch', () => {
    expect(at('gytha', env())).toBe('npc-post.gytha.hut');
    expect(at('gytha', env({ m25: 'active' }))).toBe('npc-post.gytha.inside');
    expect(at('gytha', env({ m25: 'completed' }))).toBe('npc-post.gytha.hut');
    expect(at('deserter', env())).toBe('npc-post.deserter.camp');
    expect(at('deserter', env({}, { [DESERTER_STOCKS_FLAG]: true }))).toBe('npc-post.deserter.stocks');
    expect(at('bell-keeper', env())).toBe('npc-post.bell-keeper.chapel');
  });

  it('gives every Greyfen NPC its own home post, each defined once', () => {
    const posts = GREYFEN_NPCS.map((n) => n.post);
    expect(new Set(posts).size).toBe(posts.length);
    for (const p of posts) expect(layoutAnchors.has(p), p).toBe(true);
  });
});
