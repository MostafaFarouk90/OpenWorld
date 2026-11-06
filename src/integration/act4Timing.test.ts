import { describe, expect, it } from 'vitest';
import {
  ACT4_LEG_MPS, act4Estimate, act4PacingReport, act4TimingMarkdown, estimateAct4Row, phaseGGate, PHASE_G_GATE, type Act4PaceRow,
} from './act4Timing';
import { ACT4_PLANNED_PACE } from './act4PlannedPace';
import { ACT4_JUMP_IDS, ACT4_PHASE_G } from '../quests/act4Jump';
import { ACT4_BEAT_S, ESCORT_CART_MPS, STORM_WALK_MPS } from './timing';

const planned = () =>
  ACT4_PLANNED_PACE.map((p) => {
    let m = 0;
    let s = 0;
    for (const [leg, metres] of Object.entries(p.metres)) {
      m += metres!;
      s += metres! / ACT4_LEG_MPS[leg as keyof typeof ACT4_LEG_MPS];
    }
    return act4Estimate(p.quest, p.design, m, s, p.nodes, p.beats);
  });

// Points on a line: anchor `aN` sits N metres along x.
const at = (a: string) => ({ x: Number(a.slice(1)), z: 0 });
const row = (over: Partial<Act4PaceRow> = {}): Act4PaceRow => ({
  quest: 'm35', design: 40, route: ['a0', 'a900'], legs: ['foot'], nodes: 30, beats: { killUnit: 6 }, ...over,
});

describe('Act 4 pacing estimator', () => {
  it('has the new constants (plan 1.3)', () => {
    expect(ACT4_BEAT_S.shelterWait).toBe(30);
    expect(STORM_WALK_MPS).toBe(3);
    expect(ESCORT_CART_MPS).toBe(1.5);
    expect(ACT4_BEAT_S.killUnit).toBe(45);
  });

  it('reproduces plan Part 7.1 row by row, by phase and for the act', () => {
    expect(ACT4_PLANNED_PACE.map((r) => r.quest).sort()).toEqual([...ACT4_JUMP_IDS].sort());
    const rows = planned();
    for (const r of rows) {
      const p = ACT4_PLANNED_PACE.find((x) => x.quest === r.quest)!;
      expect(Math.abs(r.estimateMin - p.planned), r.quest).toBeLessThan(0.06);
    }
    const rep = act4PacingReport(rows);
    expect(rep.phases.G!.designMin).toBe(590);
    expect(rep.phases.H!.designMin).toBe(380);
    expect(rep.phases.G!.estimateMin).toBeCloseTo(313.2, 0);
    expect(rep.phases.H!.estimateMin).toBeCloseTo(199.1, 0);
    expect(rep.act.estimateMin).toBeCloseTo(512.1, 0);
    expect(Math.round(rep.phases.G!.share * 100)).toBe(53);
    expect(rep.failures).toEqual([]);
    expect(phaseGGate(rep).ok, act4TimingMarkdown(rep)).toBe(true);
  });

  it('counts each leg at its own speed and a door as nothing', () => {
    const base = estimateAct4Row(row({ legs: ['foot'] }), at);
    expect(base.travelS).toBeCloseTo(200);
    expect(estimateAct4Row(row({ legs: ['storm'] }), at).travelS).toBeCloseTo(300);
    expect(estimateAct4Row(row({ legs: ['cart'] }), at).travelS).toBeCloseTo(600);
    expect(estimateAct4Row(row({ legs: ['follow'] }), at).travelS).toBeCloseTo(450);
    expect(estimateAct4Row(row({ legs: ['ride'] }), at).travelS).toBeCloseTo(100);
    const door = estimateAct4Row(row({ legs: ['door'] }), at);
    expect(door.travelM).toBe(0);
    expect(door.travelS).toBe(0);
  });

  it('caps travel at 3/7 of talk and beats, and leaves it alone under the cap', () => {
    const capped = estimateAct4Row(row({ route: ['a0', 'a9000'], legs: ['cart'] }), at);
    expect(capped.countedTravelS).toBeCloseTo((3 / 7) * (capped.talkS + capped.beatS));
    const free = estimateAct4Row(row(), at);
    expect(free.countedTravelS).toBe(free.travelS);
  });

  it('uses the nodes a run read when given', () => {
    expect(estimateAct4Row(row(), at, 10).nodes).toBe(10);
  });

  it('fails a row under 40% naming it, and reports one between 40% and 45%', () => {
    const low = act4Estimate('m35', 40, 0, 0, 30, {}); // 10 min of 40 = 25%
    const mid = act4Estimate('m36', 40, 0, 0, 51, {}); // 17 min = 42.5%
    const rep = act4PacingReport([low, mid]);
    expect(rep.failures).toEqual(['m35']);
    expect(rep.reported).toEqual(['m36']);
    expect(phaseGGate(rep).reasons.join(' ')).toMatch(/under the 40% floor: m35/);
  });

  it('gates Phase G at 51%: fails just under, passes at the line, names unmeasured quests', () => {
    const mk = (share: number) => ACT4_PHASE_G.map((q) => act4Estimate(q, 60, 0, 0, (share * 60 * 60) / 20, {}));
    expect(phaseGGate(act4PacingReport(mk(0.509))).ok).toBe(false);
    expect(phaseGGate(act4PacingReport(mk(PHASE_G_GATE))).ok).toBe(true);
    const some = act4PacingReport(mk(0.6).slice(1));
    expect(phaseGGate(some).reasons[0]).toMatch(/not measured: m35/);
  });

  it('refuses broken input', () => {
    expect(() => estimateAct4Row(row({ legs: [] }), at)).toThrow(/legs/);
    expect(() => estimateAct4Row(row({ legs: ['swim' as never] }), at)).toThrow(/unknown mode/);
    expect(() => estimateAct4Row(row({ beats: { dance: 1 } as never }), at)).toThrow(/unknown beat/);
    expect(() => act4Estimate('m35', 0, 0, 0, 1, {})).toThrow(/design/);
    expect(() => act4PacingReport([act4Estimate('m35', 40, 0, 0, 1, {}), act4Estimate('m35', 40, 0, 0, 1, {})])).toThrow(/twice/);
    const missing = (a: string) => { throw new Error(`no anchor ${a}`); };
    expect(() => estimateAct4Row(row({ route: ['x.y', 'z'] }), missing)).toThrow(/no anchor x\.y/);
  });
});
