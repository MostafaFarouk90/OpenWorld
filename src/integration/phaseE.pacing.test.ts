// The Phase E pacing gate on the Greyfen quest thread's rows (K12's `GREYFEN_PACE`, read unchanged as `Act3PaceRow`) with
// their planned nodes: every quest at 40% or more and the block at 52% or more. The same gate on the nodes a headless run
// actually read is in phaseE.runA/runB.e2e.test.ts.
import { describe, expect, it } from 'vitest';
import { GREYFEN_PACE, paceAt, paceRow } from '../quests/content/act3/greyfen/pacing';
import { act3PacingReport, act3TimingMarkdown, estimateAct3Row, phaseEGate, type Act3PaceRow } from './act3Timing';
import { PHASE_E_ORDER } from './phaseE';

const rows: readonly Act3PaceRow[] = GREYFEN_PACE;
const measure = () => rows.map((r) => estimateAct3Row(r, paceAt));

describe('Phase E pacing on the Greyfen rows (planned nodes)', () => {
  it('has one row per Greyfen quest', () => {
    expect(rows.map((r) => r.quest).sort()).toEqual([...PHASE_E_ORDER].sort());
  });

  it('agrees with the quest thread\'s own estimate on every row (same formula, same speeds)', () => {
    for (const r of measure()) {
      const theirs = paceRow(GREYFEN_PACE.find((x) => x.quest === r.quest)!);
      // K12 rounds each leg to 0.1 m; nothing else differs.
      expect(Math.abs(r.estimateMin - theirs.minutes), r.quest).toBeLessThan(0.01);
    }
  });

  it('clears the 40% floor on every quest and the 52% Greyfen gate', () => {
    const report = act3PacingReport(measure());
    const gate = phaseEGate(report, PHASE_E_ORDER);
    expect(gate.reasons, act3TimingMarkdown(report)).toEqual([]);
    expect(report.failures).toEqual([]);
    expect(report.blocks.greyfen!.share).toBeGreaterThanOrEqual(0.52);
  });
});
