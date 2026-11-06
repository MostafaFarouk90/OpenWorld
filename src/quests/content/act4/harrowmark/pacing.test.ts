// The Harrowmark rows on L13's estimator: every row's route resolves on real anchors, each quest stands at 45% or more of its
// design minutes (40% fails), and the nine together sit at the plan's share or better.
import { describe, expect, it } from 'vitest';
import { act4PacingReport, estimateAct4Row } from '../../../../integration/act4Timing';
import { HARROWMARK_A4_QUEST_IDS } from './harrowmark.content';
import { HARROWMARK_A4_PACE, paceAt } from './pacing';

const rows = HARROWMARK_A4_PACE.map((r) => estimateAct4Row(r, paceAt));
const report = act4PacingReport(rows);

describe('Harrowmark pacing', () => {
  it('has one row per quest and every route resolves', () => {
    expect(HARROWMARK_A4_PACE.map((r) => r.quest).sort()).toEqual([...HARROWMARK_A4_QUEST_IDS].sort());
    for (const r of HARROWMARK_A4_PACE) for (const a of r.route) expect(() => paceAt(a), `${r.quest} ${a}`).not.toThrow();
  });
  it('no quest under 45%', () => {
    expect(report.failures).toEqual([]);
    expect(report.reported).toEqual([]);
  });
});
