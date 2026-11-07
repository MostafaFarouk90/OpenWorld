import { describe, expect, it } from 'vitest';
import {
  ACT5_ACT_TARGET, ACT5_LEG_MPS, PHASE_I_GATE, PHASE_J_GATE, act5Estimate, act5FinalGate, act5PacingReport, act5TimingMarkdown,
  estimateAct5Row, phaseIGate, type Act5PaceRow, type Act5TimingRow,
} from './act5Timing';
import { ACT5_PLANNED_PACE, type Act5PlannedRow } from './act5PlannedPace';
import { ACT5_BEAT_S, ACT4_BEAT_S, trailNodes } from './timing';
import { ACT5_PHASE_I, ACT5_PHASE_J } from '../quests/act5Jump';

const planned = (r: Act5PlannedRow): Act5TimingRow => {
  const travelS = Object.entries(r.metres).reduce((s, [leg, m]) => s + (m ?? 0) / ACT5_LEG_MPS[leg as keyof typeof ACT5_LEG_MPS], 0);
  const travelM = Object.values(r.metres).reduce((s, m) => s + (m ?? 0), 0);
  return act5Estimate(r.quest, r.design, travelM, travelS, r.nodes, r.beats, r.notes);
};
const planReport = () => act5PacingReport(ACT5_PLANNED_PACE.map(planned));

describe('ACT5_BEAT_S', () => {
  it('adds the three Act 5 beats and keeps every Act 4 beat unchanged', () => {
    expect(ACT5_BEAT_S.crossing).toBe(30);
    expect(ACT5_BEAT_S.bossphase).toBe(180);
    expect(ACT5_BEAT_S.order).toBe(20);
    for (const [k, v] of Object.entries(ACT4_BEAT_S)) expect(ACT5_BEAT_S[k as keyof typeof ACT5_BEAT_S], k).toBe(v);
  });
});

describe('the Act 5 estimator on the plan (Part 7.1)', () => {
  it('reproduces every planned row within 0.15 min', () => {
    for (const r of ACT5_PLANNED_PACE) expect(Math.abs(planned(r).estimateMin - r.planned), r.quest).toBeLessThan(0.15);
  });

  it('covers all 17 quests once, in the two phases', () => {
    expect(ACT5_PLANNED_PACE.map((r) => r.quest).sort()).toEqual([...ACT5_PHASE_I, ...ACT5_PHASE_J].sort());
  });

  it('Phase I 197.4 of 355, Phase J 244.8 of 450, the act 442.2 of 805, and both gates pass', () => {
    const rep = planReport();
    expect(rep.phases.I!.designMin).toBe(355);
    expect(rep.phases.J!.designMin).toBe(450);
    expect(Math.abs(rep.phases.I!.estimateMin - 197.4)).toBeLessThan(0.5);
    expect(Math.abs(rep.phases.J!.estimateMin - 244.8)).toBeLessThan(0.5);
    expect(Math.abs(rep.act.estimateMin - 442.2)).toBeLessThan(0.5);
    expect(rep.failures).toEqual([]);
    expect(phaseIGate(rep)).toEqual({ ok: true, reasons: [] });
    expect(act5FinalGate(rep)).toEqual({ ok: true, reasons: [] });
    expect(act5TimingMarkdown(rep)).toContain('| **Phase I** |');
  });
});

describe('the gates fail where they should', () => {
  it('a row under 40% fails its phase gate and is named', () => {
    const rows = ACT5_PLANNED_PACE.map(planned).map((r) => (r.quest === 'm48' ? act5Estimate('m48', 45, 0, 0, 30, {}) : r));
    const rep = act5PacingReport(rows);
    expect(rep.rows.find((r) => r.quest === 'm48')!.share).toBeLessThan(0.4);
    expect(rep.failures).toEqual(['m48']);
    expect(phaseIGate(rep).reasons).toContain('under the 40% floor: m48');
    // Phase J unaffected by a Phase I row's floor
    expect(act5FinalGate(rep).reasons.some((x) => x.startsWith('Phase J'))).toBe(false);
  });

  it('Phase I at just under 52% fails; at 52% passes', () => {
    const mk = (min: number) => act5PacingReport(ACT5_PHASE_I.map((q, i) => act5Estimate(q, i === 0 ? 355 : 1e-9 + 1, 0, 0, 0, {})).map((r, i) => ({ ...r, estimateMin: i === 0 ? min : 0, designMin: i === 0 ? 355 : 0, share: i === 0 ? min / 355 : 1 })));
    expect(phaseIGate(mk(355 * 0.519)).ok).toBe(false);
    expect(phaseIGate(mk(355 * 0.519)).reasons.join()).toContain(`gate ${Math.round(PHASE_I_GATE * 100)}%`);
    expect(phaseIGate(mk(355 * 0.52)).ok).toBe(true);
  });

  it('a phase quest not measured fails its gate', () => {
    const rep = act5PacingReport(ACT5_PLANNED_PACE.filter((r) => r.quest !== 'm52').map(planned));
    expect(phaseIGate(rep).reasons).toContain('Phase I quests not measured: m52');
  });

  it('the final gate holds Phase J and the act at 51%', () => {
    expect(PHASE_J_GATE).toBe(0.51);
    expect(ACT5_ACT_TARGET).toBe(0.51);
    const rows = ACT5_PLANNED_PACE.map(planned).map((r) => (r.phase === 'J' ? { ...r, estimateMin: r.designMin * 0.5, share: 0.5 } : r));
    const g = act5FinalGate(act5PacingReport(rows));
    expect(g.ok).toBe(false);
    expect(g.reasons.some((x) => x.startsWith('Phase J at 50.00%'))).toBe(true);
  });
});

describe('the note convention (a note is one search beat, never nodes)', () => {
  it('a row with more notes than search beats is refused', () => {
    expect(() => act5Estimate('m54', 45, 0, 0, 30, { search: 3 }, ['mural-1', 'mural-2', 'mural-3', 'mural-4'])).toThrow(/4 notes but 3 search/);
  });
  it('a note listed twice is refused', () => {
    expect(() => act5Estimate('m47', 40, 0, 0, 26, { search: 3 }, ['rim-inscription', 'rim-inscription'])).toThrow(/twice/);
  });
  it('headless node counts drop note talks', () => {
    const trail = { talks: [{ npc: 'alric', nodes: 8 }, { npc: 'note-rim-inscription', nodes: 4 }], scripted: [], order: [] };
    expect(trailNodes(trail as never)).toBe(8);
  });
  it('the plan rows that carry notes keep them as search beats', () => {
    for (const r of ACT5_PLANNED_PACE.filter((x) => x.notes)) expect(r.beats.search ?? 0, r.quest).toBeGreaterThanOrEqual(r.notes!.length);
  });
});

describe('row errors and edges', () => {
  const at = (id: string) => ({ a: { x: 0, z: 0 }, b: { x: 900, z: 0 }, c: { x: 900, z: 4500 } } as Record<string, { x: number; z: number }>)[id]!;
  const row = (over: Partial<Act5PaceRow>): Act5PaceRow => ({ quest: 'm47', design: 40, route: ['a', 'b'], legs: ['foot'], nodes: 26, beats: { search: 1 }, ...over });

  it('a ride leg throws: the Caldera is foot only', () => {
    expect(() => estimateAct5Row(row({ legs: ['ride' as never] }), at)).toThrow(/foot only/);
  });
  it('legs must match the route', () => {
    expect(() => estimateAct5Row(row({ legs: [] }), at)).toThrow(/legs/);
  });
  it('a door leg counts no travel', () => {
    expect(estimateAct5Row(row({ legs: ['door'] }), at).travelM).toBe(0);
  });
  it('the 3/7 cap binds a long cart leg', () => {
    const r = estimateAct5Row(row({ route: ['b', 'c'], legs: ['cart'], nodes: 10, beats: {} }), at);
    expect(r.travelS).toBeCloseTo(3000);
    expect(r.countedTravelS).toBeCloseTo((3 / 7) * 200);
  });
  it('an unknown beat, a negative count, bad design minutes and a quest measured twice throw', () => {
    expect(() => act5Estimate('m47', 40, 0, 0, 1, { nope: 1 } as never)).toThrow(/unknown beat/);
    expect(() => act5Estimate('m47', 40, 0, 0, 1, { search: -1 })).toThrow(/count/);
    expect(() => act5Estimate('m47', 0, 0, 0, 1, {})).toThrow(/design/);
    const r = act5Estimate('m47', 40, 0, 0, 1, {});
    expect(() => act5PacingReport([r, r])).toThrow(/twice/);
  });
  it('a headless node count overrides the plan', () => {
    expect(estimateAct5Row(row({}), at, 40).nodes).toBe(40);
  });
});
