// The Foundry trees: every talk row opens where the quests expect, the walk of each shorter-branch talk matches the pacing
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
