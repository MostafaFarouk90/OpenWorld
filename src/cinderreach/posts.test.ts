import { describe, expect, it } from 'vitest';
import type { ConditionEnv } from '../quests/ports';
import { POST_RULES, resolvePosts } from '../quests/posts';
import type { QuestState } from '../quests/types';
import { CINDERREACH_LAYOUT } from './cinderreach.layout';
import { CINDERREACH_NPCS, CINDERREACH_NPC_DEFS } from './npcDefs';

function env(quests: Record<string, QuestState> = {}, flags: Record<string, string | boolean | number> = {}): ConditionEnv {
  return {
    state: { getFlag: (k: string) => flags[k] } as never,
    quests: { state: (id: string) => quests[id] ?? 'inactive', objectiveDone: () => false } as never,
  };
}
const at = (npc: string, e: ConditionEnv) => resolvePosts(POST_RULES, e)[npc];
const anchors = new Set(CINDERREACH_LAYOUT.anchors.map((a) => a.id));

describe('Cinderreach NPC posts', () => {
  it('only names anchors that exist (this layout, or an earlier region for the Act 1 rows)', () => {
    for (const r of POST_RULES.filter((x) => ['osgar', 'ketta'].includes(x.npcId))) {
      for (const id of [r.home, ...r.posts.map((p) => p.anchorId)]) expect(anchors.has(id), id).toBe(true);
    }
    for (const id of ['npc-post.gaut.cinder-road', 'npc-post.gaut.cinderford', 'npc-post.aelfreda.anvil', 'npc-post.pennard.cinderford']) expect(anchors.has(id), id).toBe(true);
  });

  it('gives each spec a def and no id twice', () => {
    const defs = new Set(CINDERREACH_NPC_DEFS.map((d) => d.id));
    const ids = CINDERREACH_NPCS.map((n) => n.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const n of CINDERREACH_NPCS) expect(defs.has(n.id), n.id).toBe(true);
  });

  it('Gaut holds the road for M11 and Cinderford after it; the Act 2 row beats the Act 1 rows that stay true', () => {
    const act1 = { m01: 'completed', m04: 'completed', m06: 'completed', m07: 'completed' } as const;
    expect(at('gaut', env({ ...act1, m11: 'active' })).anchorId).toBe('npc-post.gaut.cinder-road');
    expect(at('gaut', env({ ...act1, m11: 'completed' })).anchorId).toBe('npc-post.gaut.cinderford');
    expect(at('gaut', env({ ...act1 })).anchorId).toBe('npc-post.gaut.bastion');
  });

  it('Aelfreda stands at the Anvil from M13 until M14 is done', () => {
    const act1 = { m01: 'completed', m06: 'completed' } as const;
    expect(at('aelfreda', env({ ...act1, m13: 'completed' })).anchorId).toBe('npc-post.aelfreda.anvil');
    expect(at('aelfreda', env({ ...act1, m13: 'completed', m14: 'completed' })).anchorId).toBe('npc-post.aelfreda.chapel');
    expect(at('aelfreda', env({ ...act1, m13: 'active' })).anchorId).toBe('npc-post.aelfreda.chapel');
  });

  it('Pennard goes to Cinderford once R06 is live unless sealed, else keeps his Act 1 posts', () => {
    expect(at('pennard', env({ r06: 'active' })).anchorId).toBe('npc-post.pennard.cinderford');
    expect(at('pennard', env({ r06: 'active' }, { 'story.r06.choice': 'sealed' })).home).toBe(true);
    expect(at('pennard', env({ r06: 'completed' }, { 'story.r06.choice': 'cleansed' })).anchorId).toBe('npc-post.pennard.cinderford');
    expect(at('pennard', env({ r06: 'completed' }, { 'story.r06.choice': 'sealed' })).home).toBe(true);
    expect(at('pennard', env({ r06: 'active', m07: 'completed' })).anchorId).toBe('npc-post.pennard.cinderford');
    expect(at('pennard', env({ m07: 'active' })).anchorId).toBe('npc-post.pennard.bastion');
  });

  it('Osgar: barricade at home, the fort for D03, the camp for M15; D03 wins when both are live', () => {
    expect(at('osgar', env()).anchorId).toBe('npc-post.osgar.barricade');
    expect(at('osgar', env({ d03: 'active' })).anchorId).toBe('npc-post.osgar.scorchhold');
    expect(at('osgar', env({ m15: 'active' })).anchorId).toBe('npc-post.osgar.camp');
    expect(at('osgar', env({ d03: 'active', m15: 'active' })).anchorId).toBe('npc-post.osgar.scorchhold');
  });

  it('Ketta stays in the pasture while R05 is open and moves to Stonefold only for R07, or after R05 and M13', () => {
    expect(at('ketta', env({ r05: 'active' })).anchorId).toBe('npc-post.ketta.pasture');
    expect(at('ketta', env({ r05: 'completed' })).anchorId).toBe('npc-post.ketta.pasture');
    expect(at('ketta', env({ r05: 'completed', m13: 'completed' })).anchorId).toBe('npc-post.ketta.stonefold');
    expect(at('ketta', env({ r07: 'active' })).anchorId).toBe('npc-post.ketta.stonefold');
    expect(at('ketta', env({ m13: 'completed' })).anchorId).toBe('npc-post.ketta.pasture');
  });

  it('hides the cast of a sealed Cinderford and shows the bound carter only from M15\'s start', () => {
    const by = (id: string) => CINDERREACH_NPCS.find((n) => n.id === id)!;
    for (const id of ['maud', 'beornwyn', 'household-1', 'household-4']) expect(by(id).absentWhen).toBe('world.cinderreach.cinderford.sealed');
    expect(by('carter-bound').presentWhen).toBe('story.m15.started');
    expect(by('hrolf').absentWhen).toBe('story.m13.hrolfJoined');
  });
});
