// The Foundry trees: the start rules open the needed talk first (below), the walk of each shorter-branch talk matches the pacing
// rows' node counts, the R30 lines are one per ally, Vey's three questions offer exactly two answers in every band.
import { describe, expect, it } from 'vitest';
import type { Condition, DialogueDef, DialogueNode } from '../../../../quests/types';
import { evalCondition } from '../../../../quests/conditions';
import { dialogueDefs } from '../..';
import { FOUNDRY_A5_TALK_NODES } from '../../../../quests/content/act5/foundry/talkNodes';
import { FOUNDRY_A5_TALKS, type TalkRow } from './talks';

const defs = new Map<string, DialogueDef>(dialogueDefs.map((d) => [d.id, d]));
const envOf = (flags: Record<string, unknown>, favour: 'cold' | 'banked' = 'cold') => ({
  state: {
    getFlag: (k: string) => flags[k],
    favour: () => (favour === 'cold' ? 10 : 30),
    favourBand: () => favour,
  },
  quests: { state: () => 'active', objectiveDone: () => false, isObjectiveCurrent: () => true },
}) as never;

/** Nodes read from `seg` in this world: a failing `when` is skipped along `next`, a choice takes the first visible option. */
export function walk(d: DialogueDef, seg: string, flags: Record<string, unknown>, favour: 'cold' | 'banked' = 'cold'): number {
  const byId = new Map(d.nodes.map((n) => [n.id, n]));
  const env = envOf(flags, favour);
  const ok = (c?: Condition): boolean => evalCondition(c, env);
  let id: string | null | undefined = seg;
  let n = 0;
  for (let guard = 0; id && guard < 200; guard++) {
    const node: DialogueNode | undefined = byId.get(id);
    if (!node) throw new Error(`${d.id}: no node ${id}`);
    if (node.when !== undefined && !ok(node.when)) { id = node.next; continue; }
    n++;
    const visible = (node.choices ?? []).filter((c) => ok(c.when));
    id = visible.length ? visible[0]!.next : node.next;
  }
  return n;
}

const rowNodes = (r: TalkRow): number => {
  const d = defs.get(r.tree);
  if (!d) throw new Error(`no tree ${r.tree}`);
  return walk(d, r.seg, r.flags ?? {}, r.favour);
};

/** The segment the first matching start rule opens, in a world of quest states, done objectives and flags. */
function opens(tree: string, states: Record<string, string>, done: string[], flags: Record<string, unknown> = {}): string {
  const d = defs.get(tree)!;
  const env = {
    state: { getFlag: (k: string) => flags[k], favour: () => 10, favourBand: () => 'cold' },
    quests: { state: (q: string) => states[q] ?? 'inactive', objectiveDone: (q: string, o: string) => done.includes(`${q}.${o}`) },
  } as never;
  const rule = (d.start as { when: Condition; node: string }[]).find((r) => evalCondition(r.when, env));
  return rule?.node ?? '';
}
const PHASE_J = { m52: 'completed' };
const HOLDS = { 'story.phase.foundryOpen': true, 'story.m52.complete': true };

describe('Foundry Act 5 start rules (review: no optional offer may hide a needed talk)', () => {
  it('Wenna in the vat gallery (Spy) turns the guards even while R27 is still on offer', () => {
    const done = ['d09.brief', 'd09.enter', 'd09.patrol', 'd09.stoker', 'd09.plate', 'd09.slag'];
    expect(opens('npc-wenna', { ...PHASE_J, m53: 'completed', d09: 'active' }, done, { ...HOLDS, 'story.m21.choice': 'spy' })).toBe('a5f-d09-wenna');
  });
  it('Wulfhild and Wenna give their R30 lines while R28 and R27 are on offer', () => {
    const st = { ...PHASE_J, r30: 'active' };
    expect(opens('npc-wulfhild', st, ['r30.brief'], HOLDS)).toBe('a5f-r30-line-wulfhild');
    expect(opens('npc-wenna', st, ['r30.brief'], HOLDS)).toBe('a5f-r30-line-wenna');
  });
  it('Edric gives his R30 line while M53 is on offer or under way, but the decide hand-in comes first', () => {
    const st = { ...PHASE_J, r30: 'active' };
    expect(opens('npc-edric', st, ['r30.brief'], HOLDS)).toBe('a5f-r30-line-edric');
    expect(opens('npc-edric', { ...st, m53: 'active' }, ['r30.brief', 'm53.brief'], HOLDS)).toBe('a5f-r30-line-edric');
    const m53Done = ['brief', 'rook', 'truce', 'broken', 'gate'].map((o) => `m53.${o}`);
    expect(opens('npc-edric', { ...st, m53: 'active' }, ['r30.brief', ...m53Done], HOLDS)).toBe('a5f-m53-decide');
    expect(opens('npc-edric', PHASE_J, [], HOLDS)).toBe('a5f-m53-brief');
  });
  it('a current hand-in comes before an R30 line', () => {
    const st = { ...PHASE_J, r30: 'active', r27: 'active' };
    const r27Done = ['brief', 'enter', 'captain', 'line', 'signs', 'ready', 'hold', 'choose'].map((o) => `r27.${o}`);
    expect(opens('npc-wenna', st, ['r30.brief', ...r27Done], HOLDS)).toBe('a5f-r27-report');
  });
  it('the offers still open when nothing else is due', () => {
    expect(opens('npc-wenna', PHASE_J, [], HOLDS)).toBe('a5f-r27-brief');
    expect(opens('npc-wulfhild', PHASE_J, [], HOLDS)).toBe('a5f-r28-brief');
    expect(opens('npc-tobb', PHASE_J, [], HOLDS)).toBe('a5f-r30-brief');
  });
});

describe('PR 2 start rules (review: a talk cut short replays; nothing is offered after the descent)', () => {
  it('Ansgar stops offering R29 once M54 has started', () => {
    expect(opens('npc-ansgar', { m49: 'completed' }, [])).toBe('a5r-r29-brief');
    expect(opens('npc-ansgar', { m49: 'completed', m54: 'active' }, [], { 'story.m54.started': true })).not.toBe('a5r-r29-brief');
  });
  it('after M54 starts, Wulfhild and Tobb no longer pitch R28 or R30 (N12/N13: their older rows come back)', () => {
    const st = { ...PHASE_J, m54: 'active', d09: 'completed', r27: 'completed' };
    const down = { ...HOLDS, 'story.m54.started': true };
    expect(opens('npc-tobb', PHASE_J, [], HOLDS)).toBe('a5f-r30-brief');
    expect(opens('npc-tobb', st, [], down)).not.toMatch(/^a5f-r30-/);
    expect(opens('npc-wulfhild', st, [], down)).not.toMatch(/^a5f-r28-/);
  });
  it('Ulthred replays the parley when it was cut before its end', () => {
    expect(opens('npc-ulthred-spirit', { m55: 'active' }, [])).toBe('parley');
  });
  it('Alric replays the telling, and the aftermath of the branch written', () => {
    const told = { m56: 'active', d10: 'completed' };
    expect(opens('npc-alric', told, [])).toBe('a5f-m56-told');
    const pre = ['told', 'ysmeryth', 'company', 'choice'].map((o) => `m56.${o}`);
    expect(opens('npc-alric', told, pre, { 'story.m56.choice': 'rekindle' })).toBe('a5f-m56-after-rekindle');
    expect(opens('npc-alric', told, pre, { 'story.m56.choice': 'let-it-die' })).toBe('a5f-m56-after-let-it-die');
  });
});

describe('Foundry Act 5 dialogue', () => {
  it('every talk row resolves on a real tree', () => {
    for (const r of FOUNDRY_A5_TALKS) expect(() => rowNodes(r), `${r.tree} ${r.seg}`).not.toThrow();
  });
  it('the walked node counts are the pacing rows\' counts', () => {
    const sum: Record<string, number> = {};
    for (const r of FOUNDRY_A5_TALKS) sum[r.quest] = (sum[r.quest] ?? 0) + rowNodes(r);
    expect(sum).toEqual({ ...FOUNDRY_A5_TALK_NODES });
  });
  it('Vey offers exactly two answers to each question in every band', () => {
    const d = defs.get('npc-vey-truce')!;
    const worlds: Record<string, unknown>[] = [];
    for (const ledgers of [true, undefined]) for (const eormen of ['released', 'destroyed']) for (const band of ['light', 'heavy', 'grave', undefined]) {
      worlds.push({ 'story.d07.ledgers': ledgers, 'boss.eormen.outcome': eormen, 'story.m53.scarBand': band });
    }
    for (const w of worlds) for (const favour of ['cold', 'banked'] as const) {
      const env = envOf(w, favour);
      const shown = d.nodes.filter((n) => n.choices && (n.when === undefined || evalCondition(n.when, env))).map((n) => n.choices!.filter((c) => c.when === undefined || evalCondition(c.when, env)).length);
      expect(shown, JSON.stringify({ w, favour })).toEqual([2, 2, 2]);
    }
  });
});
