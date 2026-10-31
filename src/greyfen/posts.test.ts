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
import { GREYFEN_QUEST_LAYOUT } from '../quests/content/act3/greyfen/extraAnchors';

function env(quests: Record<string, QuestState> = {}, flags: Record<string, string | boolean | number> = {}, done: string[] = []): ConditionEnv {
  return {
    state: { getFlag: (k: string) => flags[k] } as never,
    quests: { state: (id: string) => quests[id] ?? 'inactive', objectiveDone: (q: string, o: string) => done.includes(`${q}.${o}`) } as never,
  };
}
const at = (npc: string, e: ConditionEnv) => resolvePosts(POST_RULES, e)[npc]!.anchorId;
const STATES: QuestState[] = ['inactive', 'active', 'completed', 'failed'];
const layoutAnchors = new Set(GREYFEN_LAYOUT.anchors.map((a) => a.id));
/** K3's anchors plus the few the Greyfen quests add beside them (K12, defined by the quest director). */
const questAnchors = new Set(GREYFEN_QUEST_LAYOUT.anchors.map((a) => a.id));
const interiorAnchors = new Set([...CHAPEL_DEF.anchors, ...HUT_DEF.anchors].map((a) => a.id));

describe('Greyfen NPC posts', () => {
  it('are spread into POST_RULES, name only anchors that exist, and move only Greyfen NPCs', () => {
    for (const r of GREYFEN_POST_RULES) expect(POST_RULES).toContain(r);
    const ours = new Set(GREYFEN_NPCS.map((n) => n.id));
    for (const r of GREYFEN_POST_RULES) {
      expect(ours.has(r.npcId), r.npcId).toBe(true);
      expect(layoutAnchors.has(r.home), r.home).toBe(true);
      for (const p of r.posts) expect(questAnchors.has(p.anchorId) || interiorAnchors.has(p.anchorId), p.anchorId).toBe(true);
    }
    // No other row names one of ours (first match would be ambiguous).
    const others = POST_RULES.filter((r) => !GREYFEN_POST_RULES.includes(r));
    for (const r of others) expect(ours.has(r.npcId), r.npcId).toBe(false);
  });

  it('puts Leofa at exactly one post for every M23 x M26 x M27 state: Reedgate, then Greywatch, the Mere while M26 or M27 runs', () => {
    for (const m23 of STATES) {
      for (const m26 of STATES) {
        for (const m27 of STATES) {
          const post = at('leofa', env({ m23, m26, m27 }));
          const want = m27 === 'active' || m26 === 'active' ? 'npc-post.leofa.mere' : m23 === 'completed' ? 'npc-post.leofa.greywatch' : 'npc-post.leofa.reedgate';
          expect(post, `m23 ${m23}, m26 ${m26}, m27 ${m27}`).toBe(want);
        }
      }
    }
  });

  it('takes Leofa to the Mere post once M23 has had its first sight (the report is taken there)', () => {
    expect(at('leofa', env({ m23: 'active' }))).toBe('npc-post.leofa.reedgate');
    expect(at('leofa', env({ m23: 'active' }, {}, ['m23.sight']))).toBe('npc-post.leofa.mere');
    expect(at('leofa', env({ m23: 'completed' }, {}, ['m23.sight']))).toBe('npc-post.leofa.greywatch');
  });

  it('moves Gytha to the chapel for R13, the Mere for M26 and the Deeps door for D05 (and between M27 and D05)', () => {
    expect(at('gytha', env({ r13: 'active' }))).toBe('greyfen.r13.gytha');
    expect(at('gytha', env({ m26: 'active' }))).toBe('greyfen.m26.gytha');
    expect(at('gytha', env({ d05: 'active' }))).toBe('greyfen.d05.gytha');
    expect(at('gytha', env({ m27: 'completed' }))).toBe('greyfen.d05.gytha');
    expect(at('gytha', env({ m27: 'completed', d05: 'completed' }))).toBe('npc-post.gytha.hut');
    expect(at('gytha', env({ m25: 'active', r13: 'active' }))).toBe('npc-post.gytha.inside');
    expect(at('gytha', env({ m26: 'active', r13: 'active' }))).toBe('greyfen.m26.gytha'); // both open: the Mere, M26's talks
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
