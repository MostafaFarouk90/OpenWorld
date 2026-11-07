// The Waste rows on L13's estimator, by the shipped convention (a note is one search beat, ruled 2026-11-07): every row's route
// resolves on real anchors, no quest is under the 40% floor, the rows under 45% are the known ones, and Act 4 as a whole
// (Harrowmark's thirteen rows and these eight) sits at the act target or better.
import { describe, expect, it } from 'vitest';
import { ACT4_ACT_TARGET, act4PacingReport, estimateAct4Row } from '../../../../integration/act4Timing';
import { HARROWMARK_A4_PACE, paceAt as harrowmarkAt } from '../harrowmark/pacing';
import { WASTE_A4_QUEST_IDS } from './waste.content';
import { WASTE_A4_PACE, paceAt } from './pacing';

const rows = WASTE_A4_PACE.map((r) => estimateAct4Row(r, paceAt));
const report = act4PacingReport(rows);

describe('Waste pacing', () => {
  it('has one row per quest and every route resolves', () => {
    expect(WASTE_A4_PACE.map((r) => r.quest).sort()).toEqual([...WASTE_A4_QUEST_IDS].sort());
    for (const r of WASTE_A4_PACE) for (const a of r.route) expect(() => paceAt(a), `${r.quest} ${a}`).not.toThrow();
  });
  it('no quest under the 40% floor; the rows reported under 45% are M44, R25 and M45 only', () => {
    expect(report.failures).toEqual([]);
    expect([...report.reported].sort()).toEqual(['m44', 'm45', 'r25']);
    for (const r of rows) expect(r.share, r.quest).toBeGreaterThanOrEqual(0.42);
  });
  it('Act 4 (all 21 rows) meets the act target', () => {
    const all = [...HARROWMARK_A4_PACE.map((r) => estimateAct4Row(r, harrowmarkAt)), ...rows];
    expect(all.length).toBe(21);
    const est = all.reduce((s, r) => s + r.estimateMin, 0);
    const design = all.reduce((s, r) => s + r.designMin, 0);
    expect(design).toBe(970);
    expect(est / design).toBeGreaterThanOrEqual(ACT4_ACT_TARGET);
  });
});
