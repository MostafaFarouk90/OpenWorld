// The Greyfen pacing rows (plans/act3-K12.md section 4): every row at or above 45% of its Part 7.1 design minutes, the block at
// or above K16's 52%, the node counts read off the real dialogue trees, and the legs measured on the real anchors.
import { describe, expect, it } from 'vitest';
import type { DialogueDef } from '../../../types';
import { GREYFEN_TREES } from '../../../../dialogue/content/act3/greyfen';
import { GREYFEN_TALKS } from '../../../../dialogue/content/act3/greyfen/talks';
import { GREYFEN_PACE, ACT3_BEAT_S, BLOCK_GATE, ROW_GATE, paceAt, paceBlock, paceLegs, paceRow } from './pacing';

const trees = new Map<string, DialogueDef>(GREYFEN_TREES.map((t) => [t.def.id, t.def]));

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

const nodesOf = (q: string): number => GREYFEN_TALKS.filter((t) => t.quest === q).reduce((s, t) => s + seg(t.tree, t.seg), 0);

describe('Greyfen pacing', () => {
  it('has the nine rows in play order, each with one leg per step and a known anchor at every stop', () => {
    expect(GREYFEN_PACE.map((r) => r.quest)).toEqual(['m23', 'm24', 'r12', 'm25', 'r14', 'r13', 'm26', 'm27', 'd05']);
    for (const r of GREYFEN_PACE) {
      expect(r.legs.length, r.quest).toBe(r.route.length - 1);
      for (const id of r.route) expect(() => paceAt(id), `${r.quest} ${id}`).not.toThrow();
      for (const leg of paceLegs(r)) {
        expect(['ride', 'foot', 'wade', 'glide', 'ferry', 'follow', 'door']).toContain(leg.mode);
        if (leg.mode === 'door') expect(leg.metres).toBe(0);
        else expect(leg.metres, `${r.quest} ${leg.from} to ${leg.to}`).toBeGreaterThanOrEqual(0);
      }
      for (const k of Object.keys(r.beats)) expect(ACT3_BEAT_S, k).toHaveProperty(k);
    }
  });

  it('the node counts are the shortest play through the real dialogue trees (conditional lines are skipped)', () => {
    for (const r of GREYFEN_PACE) expect(nodesOf(r.quest), r.quest).toBe(r.nodes);
  });

  it('M23 wades at 2.5 m/s and every later quest at 3.5 (the Fen Boots)', () => {
    const wadey = GREYFEN_PACE.find((r) => r.quest === 'm23')!;
    const slow = paceRow({ ...wadey, route: ['npc-post.leofa.mere', 'greyfen.mere.shore'], legs: ['wade'] });
    const fast = paceRow({ ...wadey, quest: 'm24', route: ['npc-post.leofa.mere', 'greyfen.mere.shore'], legs: ['wade'] });
    expect(slow.travelS).toBeGreaterThan(fast.travelS);
    expect(slow.travelS / fast.travelS).toBeCloseTo(3.5 / 2.5, 5);
  });

  it('caps travel at 3/7 of the talk and beats', () => {
    for (const r of GREYFEN_PACE) {
      const p = paceRow(r);
      expect(p.cappedTravelS).toBeLessThanOrEqual((3 / 7) * p.talkAndBeatsS + 1e-9);
      expect(p.cappedTravelS).toBeLessThanOrEqual(p.travelS + 1e-9);
    }
  });

  it.each(GREYFEN_PACE.map((r) => [r.quest, r] as const))('%s is at least 45% of its design minutes', (_q, row) => {
    const p = paceRow(row);
    expect(p.share, `${row.quest}: ${p.minutes.toFixed(1)} of ${row.design} min`).toBeGreaterThanOrEqual(ROW_GATE);
  });

  it('the block is at least 52% of its 420 design minutes', () => {
    const b = paceBlock();
    expect(b.design).toBe(420);
    expect(b.share, `${b.minutes.toFixed(1)} of ${b.design} min`).toBeGreaterThanOrEqual(BLOCK_GATE);
  });
});
