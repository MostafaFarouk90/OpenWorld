import { describe, expect, it } from 'vitest';
import {
  ACT3_QUEST_FLOOR, PHASE_E_GREYFEN_GATE, act3Estimate, act3PacingReport, act3TimingMarkdown, estimateAct3Row, legSpeed, phaseEGate,
  type Act3PaceRow, type Act3TimingRow,
} from './act3Timing';
import { ACT3_PLANNED_PACE } from './act3PlannedPace';
import { ACT3_BEAT_S, ACT2_BEAT_S, FERRY_MPS, GLIDE_MPS, RIDE_MPS, WADE_BOOTS_MPS, WADE_MPS, WALK_MPS } from './timing';
import { ACT3_GREYFEN, ACT3_JUMP_IDS } from '../quests/act3Jump';

/** Points on a line along x, one per anchor id `p<metres>`. */
const at = (id: string) => {
  const m = /^p(\d+)$/.exec(id);
  if (!m) throw new Error(`anchor ${id} is not defined`);
  return { x: Number(m[1]), z: 0 };
};
const row = (over: Partial<Act3PaceRow>): Act3PaceRow => ({
  quest: 'm24', design: 40, route: ['p0', 'p900'], legs: ['ride'], nodes: 30, beats: { killUnit: 10 }, ...over,
});

const planned = (): Act3TimingRow[] =>
  ACT3_PLANNED_PACE.map((r) => {
    const travelS = Object.entries(r.metres).reduce((s, [leg, m]) => s + (m ?? 0) / legSpeed(leg as never, r.quest), 0);
    const travelM = Object.values(r.metres).reduce((s, m) => s + (m ?? 0), 0);
    return act3Estimate(r.quest, r.design, travelM, travelS, r.nodes, r.beats);
  });

describe('Act 3 constants (plan 1.3)', () => {
  it('adds the dive and sled beats and keeps the Act 2 table', () => {
    expect(ACT3_BEAT_S.dive).toBe(30);
    expect(ACT3_BEAT_S.sled).toBe(90);
    for (const [k, v] of Object.entries(ACT2_BEAT_S)) expect(ACT3_BEAT_S[k as keyof typeof ACT3_BEAT_S]).toBe(v);
    expect(ACT3_BEAT_S.search).toBe(20);
    expect(ACT3_BEAT_S.structure).toBe(65);
  });

  it('counts each leg at its own speed, wading slower in M23 only (before the Fen Boots)', () => {
    expect(legSpeed('ride', 'm24')).toBe(RIDE_MPS);
    expect(legSpeed('foot', 'm24')).toBe(WALK_MPS);
    expect(legSpeed('glide', 'd06')).toBe(GLIDE_MPS);
    expect(legSpeed('ferry', 'm24')).toBe(FERRY_MPS);
    expect(legSpeed('follow', 'm24')).toBe(2);
    expect(legSpeed('door', 'm24')).toBe(0);
    expect(legSpeed('wade', 'm23')).toBe(WADE_MPS);
    expect(legSpeed('wade', 'm24')).toBe(WADE_BOOTS_MPS);
    expect(legSpeed('wade', 'd05')).toBe(WADE_BOOTS_MPS);
  });
});

describe('estimateAct3Row', () => {
  it('sums legs by mode and skips door legs', () => {
    const r = estimateAct3Row(row({ route: ['p0', 'p900', 'p5000', 'p5045'], legs: ['ride', 'door', 'foot'] }), at);
    expect(r.travelM).toBe(945);
    expect(r.travelS).toBeCloseTo(100 + 10);
    expect(r.countedTravelS).toBeCloseTo(110);
    expect(r.estimateMin).toBeCloseTo((110 + 600 + 450) / 60);
    expect(r.block).toBe('greyfen');
  });

  it('caps travel at 3/7 of talk and beats, so travel is at most 30% of the estimate', () => {
    const r = estimateAct3Row(row({ route: ['p0', 'p20000'], legs: ['foot'], nodes: 7, beats: {} }), at);
    expect(r.travelS).toBeCloseTo(20000 / WALK_MPS);
    expect(r.countedTravelS).toBeCloseTo((3 / 7) * 140);
    expect(r.countedTravelS / 60 / r.estimateMin).toBeCloseTo(0.3);
  });

  it('uses the nodes a run read when given, the planned nodes otherwise', () => {
    expect(estimateAct3Row(row({}), at).nodes).toBe(30);
    expect(estimateAct3Row(row({}), at, 12).talkS).toBe(240);
  });

  it('refuses a row whose legs do not match its route, an unknown mode, an unknown beat or a missing anchor', () => {
    expect(() => estimateAct3Row(row({ legs: [] }), at)).toThrow(/2 route points but 0 legs/);
    expect(() => estimateAct3Row(row({ legs: ['swim' as never] }), at)).toThrow(/unknown mode "swim"/);
    expect(() => estimateAct3Row(row({ beats: { juggle: 1 } as never }), at)).toThrow(/unknown beat "juggle"/);
    expect(() => estimateAct3Row(row({ route: ['p0', 'reedgate'] }), at)).toThrow(/reedgate/);
  });
});

describe('the plan table (Part 7.1) on this estimator', () => {
  it('reproduces every row to the plan\'s decimal, with no row travel-capped', () => {
    const rows = planned();
    expect(rows.map((r) => r.quest).sort()).toEqual([...ACT3_JUMP_IDS].sort());
    for (const r of rows) {
      const want = ACT3_PLANNED_PACE.find((p) => p.quest === r.quest)!.planned;
      expect(Math.abs(r.estimateMin - want), `${r.quest}: ${r.estimateMin.toFixed(2)} vs ${want}`).toBeLessThanOrEqual(0.06);
      expect(r.countedTravelS, `${r.quest} capped`).toBe(r.travelS);
    }
  });

  it('gives Greyfen 222 of 420 (53%), the act 499 of 980 (51%), every row at 45% or more', () => {
    const rep = act3PacingReport(planned());
    expect(rep.blocks.greyfen!.designMin).toBe(420);
    expect(Math.round(rep.blocks.greyfen!.estimateMin)).toBe(222);
    expect(Math.round(rep.blocks.greyfen!.share * 100)).toBe(53);
    expect(Math.round(rep.blocks.spine!.estimateMin)).toBe(149);
    expect(Math.round(rep.blocks.summit!.estimateMin)).toBe(128);
    expect(rep.act.designMin).toBe(980);
    expect(Math.round(rep.act.estimateMin)).toBe(499);
    expect(rep.failures).toEqual([]);
    expect(rep.reported).toEqual([]);
    expect(phaseEGate(rep, ACT3_GREYFEN).ok).toBe(true);
  });
});

describe('act3PacingReport and the Phase E gate', () => {
  const fake = (quest: string, estimateMin: number, design = 100): Act3TimingRow =>
    act3Estimate(quest, design, 0, 0, Math.round(estimateMin * 3), {});

  it('fails a quest under 40% and reports one under 45%', () => {
    const rep = act3PacingReport([fake('m23', 39), fake('m24', 40), fake('r12', 44), fake('m25', 45)]);
    expect(rep.failures).toEqual(['m23']);
    expect(rep.reported).toEqual(['m24', 'r12']);
    expect(rep.rows.find((r) => r.quest === 'm25')!.status).toBe('ok');
    expect(ACT3_QUEST_FLOOR).toBe(0.4);
  });

  it('refuses a quest measured twice', () => {
    expect(() => act3PacingReport([fake('m23', 50), fake('m23', 50)])).toThrow(/m23 measured twice/);
  });

  it('passes the Greyfen block at exactly 52% and fails it just under', () => {
    const at52 = ACT3_GREYFEN.map((q) => act3Estimate(q, 60, 0, 0, 0, { set: 0.52 * 60 }));
    expect(phaseEGate(act3PacingReport(at52), ACT3_GREYFEN)).toEqual({ ok: true, reasons: [] });
    const under = ACT3_GREYFEN.map((q) => act3Estimate(q, 60, 0, 0, 0, { set: 0.519 * 60 }));
    const g = phaseEGate(act3PacingReport(under), ACT3_GREYFEN);
    expect(g.ok).toBe(false);
    expect(g.reasons.join()).toMatch(/Greyfen block at 51\.9% \(gate 52%\)/);
    expect(PHASE_E_GREYFEN_GATE).toBe(0.52);
  });

  it('fails the gate when a Greyfen quest is missing or any quest is under the floor, even with the block over 52%', () => {
    const rows = ACT3_GREYFEN.filter((q) => q !== 'd05').map((q) => fake(q, 60));
    expect(phaseEGate(act3PacingReport(rows), ACT3_GREYFEN).reasons).toEqual(['Greyfen quests not measured: d05']);
    const low = [...ACT3_GREYFEN.map((q) => fake(q, q === 'r12' ? 39 : 70))];
    expect(phaseEGate(act3PacingReport(low), ACT3_GREYFEN).reasons).toEqual(['under the 40% floor: r12']);
  });

  it('fails the gate with no Greyfen rows at all', () => {
    expect(phaseEGate(act3PacingReport([]), ACT3_GREYFEN).ok).toBe(false);
  });

  it('renders a table with the blocks and the act', () => {
    const md = act3TimingMarkdown(act3PacingReport(planned()));
    expect(md).toMatch(/\| M23 \|/);
    expect(md).toMatch(/\*\*greyfen\*\*/);
    expect(md).toMatch(/\*\*act\*\* .*\*\*980\*\* \| \*\*51%\*\*/);
  });
});
