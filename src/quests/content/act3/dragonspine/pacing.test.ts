// The lower Dragonspine pacing rows (plans/act3-K13.md section 4): every row at or above 45% of its Part 7.1 design minutes, the block
// at about 51%, the node counts read off the real dialogue trees, the beats counted from the quest definitions and the legs measured
// on the real anchors.
import { describe, expect, it } from 'vitest';
import type { DialogueDef } from '../../../types';
import { DRAGONSPINE_TREES } from '../../../../dialogue/content/act3/dragonspine';
import { DRAGONSPINE_TALKS } from '../../../../dialogue/content/act3/dragonspine/talks';
import { DRAGONSPINE_QUEST_DEFS } from './dragonspine.content';
import { DRAGONSPINE_SPAWNERS } from './spawners';
import { DRAGONSPINE_GROUP_OBJECTIVES } from './groups';
import { SECTIONS } from '../../../../stealth/sections';
import { DRAGONSPINE_PACE, ACT3_BEAT_S, ROW_GATE, paceAt, paceBlock, paceLegs, paceRow } from './pacing';

const trees = new Map<string, DialogueDef>(DRAGONSPINE_TREES.map((t) => [t.def.id, t.def]));

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
const nodesOf = (q: string): number => DRAGONSPINE_TALKS.filter((t) => t.quest === q).reduce((s, t) => s + seg(t.tree, t.seg), 0);

const spawned = (tag: string): number => DRAGONSPINE_SPAWNERS.filter((s) => s.tag === tag).reduce((n, s) => n + s.count, 0);
/** The beats a quest's definition holds, counted from the definition and the spawners. */
function derived(quest: string): Record<string, number> {
  const q = DRAGONSPINE_QUEST_DEFS.find((d) => d.id === quest)!;
  const c: Record<string, number> = {};
  const add = (k: string, n: number): void => void (c[k] = (c[k] ?? 0) + n);
  for (const o of q.objectives) {
    const ev = Array.isArray(o.target) ? o.target[0] : o.target;
    if (o.type === 'kill') add('killUnit', o.required ?? 1);
    else if (o.type === 'event' && ev === 'dialogue.ended') add('search', o.required ?? 1);
    else if (o.type === 'event' && ev === 'interact' && !JSON.stringify(o.match).includes('r18-nest')) add('interact', o.required ?? 1);
    else if (o.type === 'event' && ev === 'rubbing.taken') add('search', o.required ?? 1);
    else if (o.type === 'event' && ev === 'wayside.lit') { add('interact', 1); add('carry', 1); }
    else if (o.type === 'event' && ev === 'flag.changed' && quest === 'm30') add('interact', 1);
    else if (o.type === 'event' && ev === 'shrine.rekindled') add('interact', 1);
    else if (o.type === 'event' && ev === 'story.r15.sledDelivered') add('sled', o.required ?? 1);
    else if (o.id.startsWith('ledge')) add('leap', 1);
  }
  for (const g of DRAGONSPINE_GROUP_OBJECTIVES.filter((x) => x.quest === quest)) add('killUnit', g.groups.reduce((n, id) => n + (DRAGONSPINE_SPAWNERS.find((s) => s.id === id)?.count ?? 0), 0));
  // a stealth section is a beat for every section the registry holds for the quest (src/stealth/sections.ts)
  const sections = SECTIONS.filter((x) => x.quest.id === quest).length;
  if (sections > 0) add('stealthSection', sections);
  if (quest === 'r15') add('killUnit', spawned('r15.stoop'));
  if (quest === 'r17') add('killUnit', spawned('r17.hawks.a') + spawned('r17.hawks.b'));
  return c;
}
/** Set pieces the build really has: Eadgyth's confession by the fire (M29), the mouth's Leap ledge (R16), the eggs' carries, and the three nest places (R18; its stealth section is derived from src/stealth/sections.ts). */
const SPECIAL: Record<string, Record<string, number>> = {
  m29: { set: 1 }, r16: { leap: 1 }, r18: { carry: 3, interact: 3 },
};

describe('lower Dragonspine pacing', () => {
  it.each(DRAGONSPINE_PACE.map((r) => [r.quest, r] as const))('%s: the beats are what its definition holds, nothing invented', (q, row) => {
    expect(row.beats).toEqual({ ...derived(q), ...(SPECIAL[q] ?? {}) });
  });

  it('has the seven rows in play order, each with one leg per step and a known anchor at every stop', () => {
    expect(DRAGONSPINE_PACE.map((r) => r.quest)).toEqual(['m28', 'r15', 'm29', 'r16', 'm30', 'r17', 'r18']);
    for (const r of DRAGONSPINE_PACE) {
      expect(r.legs.length, r.quest).toBe(r.route.length - 1);
      for (const id of r.route) expect(() => paceAt(id), `${r.quest} ${id}`).not.toThrow();
      for (const leg of paceLegs(r)) {
        expect(['foot', 'sled', 'door']).toContain(leg.mode);
        if (leg.mode === 'door') expect(leg.metres).toBe(0);
        else expect(leg.metres, `${r.quest} ${leg.from} to ${leg.to}`).toBeGreaterThanOrEqual(0);
      }
      for (const k of Object.keys(r.beats)) expect(ACT3_BEAT_S, k).toHaveProperty(k);
    }
  });

  it('the node counts are the shortest play through the real dialogue trees (conditional lines are skipped)', () => {
    for (const r of DRAGONSPINE_PACE) expect(nodesOf(r.quest), r.quest).toBe(r.nodes);
  });

  it("the design minutes are Part 7.1's and total 295", () => {
    expect(Object.fromEntries(DRAGONSPINE_PACE.map((r) => [r.quest, r.design]))).toEqual({ m28: 50, r15: 40, m29: 40, r16: 40, m30: 50, r17: 35, r18: 40 });
    expect(paceBlock().design).toBe(295);
  });

  it('caps travel at 3/7 of the talk and beats', () => {
    for (const r of DRAGONSPINE_PACE) {
      const p = paceRow(r);
      expect(p.cappedTravelS).toBeLessThanOrEqual((3 / 7) * p.talkAndBeatsS + 1e-9);
      expect(p.cappedTravelS).toBeLessThanOrEqual(p.travelS + 1e-9);
    }
  });

  it('a sled leg is dragged at 60% of walking speed', () => {
    const r = DRAGONSPINE_PACE.find((x) => x.quest === 'r15')!;
    const foot = paceRow({ ...r, route: ['dragonspine.r15.sled-start.1', 'dragonspine.r15.cache'], legs: ['foot'] });
    const sled = paceRow({ ...r, route: ['dragonspine.r15.sled-start.1', 'dragonspine.r15.cache'], legs: ['sled'] });
    expect(sled.travelS / foot.travelS).toBeCloseTo(1 / 0.6, 5);
  });

  it.each(DRAGONSPINE_PACE.map((r) => [r.quest, r] as const))('%s is at least 45% of its design minutes', (_q, row) => {
    const p = paceRow(row);
    expect(p.share, `${row.quest}: ${p.minutes.toFixed(1)} of ${row.design} min`).toBeGreaterThanOrEqual(ROW_GATE);
  });

  it('the block is about half of its 295 design minutes (at least 49%)', () => {
    const b = paceBlock();
    expect(b.share, `${b.minutes.toFixed(1)} of ${b.design} min`).toBeGreaterThanOrEqual(0.49);
  });
});
