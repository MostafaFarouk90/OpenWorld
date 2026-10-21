import { describe, expect, it } from 'vitest';
import { GRISEL_HALL_DEF } from './griselHall';
import { evalCondition } from '../quests/conditions';
import type { ConditionEnv } from '../quests/ports';
import { POST_RULES, resolvePosts } from '../quests/posts';
import type { QuestState } from '../quests/types';
import { HALL_HOSTILE_FLAG, MARKET_MINER_GUARD_FLAG, MARKET_STEWARD_GUARD_FLAG } from './flags';
import { OLDSMOKE_LAYOUT } from './oldsmoke.layout';
import { OLDSMOKE_NPC_DEFS, OLDSMOKE_NPC_STRINGS_EN, OLDSMOKE_NPCS } from './npcDefs';
import { OLDSMOKE_POST_RULES } from './postRules';

function env(quests: Record<string, QuestState> = {}, flags: Record<string, string | boolean | number> = {}): ConditionEnv {
  return {
    state: { getFlag: (k: string) => flags[k] } as never,
    quests: { state: (id: string) => quests[id] ?? 'inactive', objectiveDone: () => false } as never,
  };
}
const at = (npc: string, e: ConditionEnv) => resolvePosts(POST_RULES, e)[npc];
const layoutAnchors = new Set(OLDSMOKE_LAYOUT.anchors.map((a) => a.id));
const hallAnchors = new Set(GRISEL_HALL_DEF.anchors.map((a) => a.id));

describe('Deepgate NPC posts', () => {
  it('only names anchors that exist (this layout, or the hall interior for the always-on rows)', () => {
    for (const r of OLDSMOKE_POST_RULES) {
      expect(layoutAnchors.has(r.home), r.home).toBe(true);
      for (const p of r.posts) expect(layoutAnchors.has(p.anchorId) || hallAnchors.has(p.anchorId), p.anchorId).toBe(true);
    }
  });

  it('comes first in POST_RULES, and no Act 1 row names a Deepgate NPC', () => {
    expect(POST_RULES.slice(0, OLDSMOKE_POST_RULES.length)).toEqual(OLDSMOKE_POST_RULES);
    const ours = new Set(OLDSMOKE_NPCS.map((n) => n.id));
    for (const r of POST_RULES.slice(OLDSMOKE_POST_RULES.length)) expect(ours.has(r.npcId), r.npcId).toBe(false);
  });

  it('leaves Act 1\'s Lord Grisel (`grisel`) where he is: Deepgate\'s Aldous is a separate NPC', () => {
    expect(OLDSMOKE_NPCS.some((n) => n.id === 'grisel')).toBe(false);
    expect(OLDSMOKE_NPCS.some((n) => n.id === 'aldous')).toBe(true);
    expect(at('grisel', env({ m08: 'active' })).anchorId).toBe('npc-post.grisel.hall');
  });

  it('gives each spec a def and a name, and no id twice', () => {
    const defs = new Set(OLDSMOKE_NPC_DEFS.map((d) => d.id));
    const ids = OLDSMOKE_NPCS.map((n) => n.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(defs.size).toBe(OLDSMOKE_NPC_DEFS.length);
    for (const n of OLDSMOKE_NPCS) {
      expect(defs.has(n.id), n.id).toBe(true);
      expect(OLDSMOKE_NPC_STRINGS_EN[`npc.${n.id}.name`], n.id).toBeTruthy();
    }
  });

  it('Slagg is at the shaft, goes to the market while R09 or R10 is live, and comes back', () => {
    expect(at('slagg', env()).home).toBe(true);
    expect(at('slagg', env({ r09: 'active' })).anchorId).toBe('npc-post.slagg.market');
    expect(at('slagg', env({ r10: 'active' })).anchorId).toBe('npc-post.slagg.market');
    expect(at('slagg', env({ m17: 'active' })).home).toBe(true);
    expect(at('slagg', env({ r09: 'completed', r10: 'completed' })).home).toBe(true);
  });

  it('Pike stays at the shaft head (no row moves him in PR 1)', () => {
    expect(OLDSMOKE_POST_RULES.some((r) => r.npcId === 'pike')).toBe(false);
    expect(OLDSMOKE_NPCS.find((n) => n.id === 'pike')!.post).toBe('npc-post.pike.shaft');
  });

  it('Aldous and the hall stewards move onto the hall\'s own posts; Wenna too until M19 hands her to A13', () => {
    expect(at('aldous', env()).anchorId).toBe('oldsmoke.hall.aldous');
    for (const n of [1, 2, 3, 4]) expect(at(`steward-hall-${n}`, env()).anchorId).toBe(`oldsmoke.hall.steward.${n}`);
    expect(at('wenna', env()).anchorId).toBe('oldsmoke.hall.wenna');
    // From M19 the director does not place her at all (`leaveWhen`): A13's route owns her.
    const leave = OLDSMOKE_POST_RULES.find((r) => r.npcId === 'wenna')!.leaveWhen;
    expect(evalCondition(leave, env())).toBe(false);
    expect(evalCondition(leave, env({ m18: 'completed' }))).toBe(false);
    expect(evalCondition(leave, env({ m19: 'active' }))).toBe(true);
    expect(evalCondition(leave, env({ m19: 'completed' }))).toBe(true);
  });

  it('shows the market\'s guards by R10 and the hall stewards unless M21 turned hostile', () => {
    const by = (id: string) => OLDSMOKE_NPCS.find((n) => n.id === id)!;
    for (const id of ['steward-market-1', 'steward-market-2']) expect(by(id).presentWhen).toBe(MARKET_STEWARD_GUARD_FLAG);
    for (const id of ['miner-guard-1', 'miner-guard-2']) expect(by(id).presentWhen).toBe(MARKET_MINER_GUARD_FLAG);
    for (const n of [1, 2, 3, 4]) expect(by(`steward-hall-${n}`).absentWhen).toBe(HALL_HOSTILE_FLAG);
    expect(by('steward-gate-1').presentWhen).toBeUndefined();
    expect(by('steward-gate-1').absentWhen).toBeUndefined();
  });

  it('puts each market guard post on a distinct anchor from the others', () => {
    const posts = OLDSMOKE_NPCS.map((n) => n.post);
    expect(new Set(posts).size).toBe(posts.length);
  });
});
