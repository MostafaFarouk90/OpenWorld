// The summit pacing rows (plans/act3-K13-pr2.md section 4): every row at or above 45% of its Part 7.1 design minutes, the node counts read off the real
// dialogue trees, the beats counted from the quest definitions and the legs measured on K4's real anchors.
import { describe, expect, it } from 'vitest';
import type { DialogueDef } from '../../../types';
import { SUMMIT_TREES, SUMMIT_EXTENSIONS } from '../../../../dialogue/content/act3/summit';
import { SUMMIT_TALKS } from '../../../../dialogue/content/act3/summit/talks';
import { SUMMIT_QUEST_DEFS } from './summit.content';
import { SUMMIT_SPAWNERS } from './spawners';
import { SUMMIT_GROUP_OBJECTIVES } from './groups';
import { SUMMIT_PACE, ACT3_BEAT_S, paceRow } from './pacing';
import { paceAt, paceBlock, paceLegs, ROW_GATE } from '../dragonspine/pacing';
import { ACT3_COMPANION_SCENES } from '../../../../dialogue/content/act3/companions';

const trees = new Map<string, DialogueDef>([...SUMMIT_TREES, ...SUMMIT_EXTENSIONS, ...ACT3_COMPANION_SCENES].map((t) => [t.def.id, t.def]));

/** Nodes on the shortest way through a segment: conditional lines (skipped when their condition fails) and branch tails past the shortest choice are not counted. */
function shortest(def: DialogueDef, id: string | null | undefined, seen = new Set<string>()): number {
  if (!id || seen.has(id)) return 0;
  const n = def.nodes.find((x) => x.id === id);
  if (!n) return 0;
  const next = new Set(seen).add(id);
  const own = n.when ? 0 : 1;
  if (n.choices?.length) return own + Math.min(...n.choices.map((c) => shortest(def, c.next, next)));
  return own + shortest(def, n.next, next);
}
const seg = (tree: string, segment: string): number => shortest(trees.get(tree)!, segment);
const nodesOf = (q: string): number => SUMMIT_TALKS.filter((t) => t.quest === q).reduce((s, t) => s + seg(t.tree, t.seg), 0);

const spawned = (id: string): number => SUMMIT_SPAWNERS.find((s) => s.id === id)?.count ?? 0;
function derived(quest: string): Record<string, number> {
  const q = SUMMIT_QUEST_DEFS.find((d) => d.id === quest)!;
  const c: Record<string, number> = {};
  const add = (k: string, n: number): void => void (c[k] = (c[k] ?? 0) + n);
  for (const o of q.objectives) {
    const ev = Array.isArray(o.target) ? o.target[0] : o.target;
    if (o.type === 'event' && ev === 'dialogue.ended') add('search', o.required ?? 1);
    else if (o.type === 'event' && ev === 'interact') add('interact', o.required ?? 1);
    else if (o.type === 'event' && ev === 'shrine.rekindled') add('interact', 1);
    else if (quest === 'm31' && o.id.startsWith('ledge')) add('leap', 1); // M34's `ledge` is a walk to the updraft, not a Leap
    else if (o.id === 'skarl') add('boss', 1);
    else if (o.id === 'trial') add('duelRound', 2);
  }
  for (const g of SUMMIT_GROUP_OBJECTIVES.filter((x) => x.quest === quest)) add('killUnit', g.groups.reduce((n, id) => n + spawned(id), 0));
  return c;
}
/** Set pieces the build really has: M31's climb, M32's lay and the vision, M33's flight, M34's oath and the ledge. (The lay prop and the rekindle are counted as interacts above.) */
const SPECIAL: Record<string, Record<string, number>> = {
  m31: { set: 1 }, m32: { set: 2 }, m33: { set: 1 }, m34: { set: 2 },
};
const withSpecial = (q: string): Record<string, number> => {
  const out = { ...derived(q) };
  for (const [k, v] of Object.entries(SPECIAL[q] ?? {})) out[k] = (out[k] ?? 0) + v;
  return out;
};

describe('summit pacing', () => {
  it.each(SUMMIT_PACE.map((r) => [r.quest, r] as const))('%s: the beats are what its definition holds, nothing invented', (q, row) => {
    expect(row.beats).toEqual(withSpecial(q));
  });

  it('has the five rows in play order, each with one leg per step and a known anchor at every stop', () => {
    expect(SUMMIT_PACE.map((r) => r.quest)).toEqual(['m31', 'm32', 'm33', 'm34', 'd06']);
    for (const r of SUMMIT_PACE) {
      expect(r.legs.length, r.quest).toBe(r.route.length - 1);
      for (const id of r.route) expect(() => paceAt(id), `${r.quest} ${id}`).not.toThrow();
      for (const leg of paceLegs(r)) {
        expect(['foot', 'ride', 'glide', 'door']).toContain(leg.mode);
        if (leg.mode === 'door') expect(leg.metres).toBe(0);
        else expect(leg.metres, `${r.quest} ${leg.from} to ${leg.to}`).toBeGreaterThanOrEqual(0);
      }
      for (const k of Object.keys(r.beats)) expect(ACT3_BEAT_S, k).toHaveProperty(k);
    }
  });

  it('the node counts are the shortest play through the real dialogue trees (conditional lines are skipped)', () => {
    for (const r of SUMMIT_PACE) expect(nodesOf(r.quest), r.quest).toBe(r.nodes);
  });

  it("the design minutes are Part 7.1's and total 265", () => {
    expect(Object.fromEntries(SUMMIT_PACE.map((r) => [r.quest, r.design]))).toEqual({ m31: 60, m32: 45, m33: 50, m34: 45, d06: 65 });
    expect(paceBlock(SUMMIT_PACE).design).toBe(265);
  });

  it('caps travel at 3/7 of the talk and beats', () => {
    for (const r of SUMMIT_PACE) {
      const p = paceRow(r);
      expect(p.cappedTravelS).toBeLessThanOrEqual((3 / 7) * p.talkAndBeatsS + 1e-9);
      expect(p.cappedTravelS).toBeLessThanOrEqual(p.travelS + 1e-9);
    }
  });

  it.each(SUMMIT_PACE.map((r) => [r.quest, r] as const))('%s is at least 45%% of its design minutes', (_q, row) => {
    const p = paceRow(row);
    expect(p.share, `${row.quest}: ${p.minutes.toFixed(1)} of ${row.design} min`).toBeGreaterThanOrEqual(ROW_GATE);
  });

  it('the block is over half of its 265 design minutes', () => {
    const b = paceBlock(SUMMIT_PACE);
    expect(b.share, `${b.minutes.toFixed(1)} of ${b.design} min`).toBeGreaterThanOrEqual(0.5);
    console.log(SUMMIT_PACE.map((r) => `${r.quest} ${paceRow(r).minutes.toFixed(1)}/${r.design} (${(paceRow(r).share * 100).toFixed(1)}%)`).join(', '), `block ${b.minutes.toFixed(1)}/${b.design} (${(b.share * 100).toFixed(1)}%)`);
  });
});
