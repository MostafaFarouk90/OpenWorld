// The Waste rows on L13's estimator: every row's route resolves on real anchors, each quest stands at 45% or more of its design
// minutes (40% fails), and the eight together sit at the plan's share or better.
import { describe, expect, it } from 'vitest';
import { ACT4_ACT_TARGET, act4PacingReport, estimateAct4Row } from '../../../../integration/act4Timing';
import { WASTE_A4_QUEST_IDS } from './waste.content';
import { WASTE_A4_PACE, paceAt } from './pacing';

const rows = WASTE_A4_PACE.map((r) => estimateAct4Row(r, paceAt));
const report = act4PacingReport(rows);

describe('Waste pacing', () => {
  it('has one row per quest and every route resolves', () => {
    expect(WASTE_A4_PACE.map((r) => r.quest).sort()).toEqual([...WASTE_A4_QUEST_IDS].sort());
    for (const r of WASTE_A4_PACE) for (const a of r.route) expect(() => paceAt(a), `${r.quest} ${a}`).not.toThrow();
  });
  it('no quest under 45%', () => {
    expect(report.failures).toEqual([]);
    expect(report.reported).toEqual([]);
  });
  it('the eight together meet the act target', () => {
    const est = rows.reduce((s, r) => s + r.estimateMin, 0);
    const design = rows.reduce((s, r) => s + r.designMin, 0);
    expect(est / design).toBeGreaterThanOrEqual(ACT4_ACT_TARGET);
  });
});
