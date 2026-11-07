// The Rim rows on L13's estimator with Act 5's local beats (a note is one search beat, ruled 2026-11-07): one row per quest,
// every route resolves on real anchors (N1's Caldera, L1's Rimfoot, N2's interiors, mine), and every row meets the Phase I floor.
import { describe, expect, it } from 'vitest';
import { RIM_A5_QUEST_IDS } from './rim.content';
import { PHASE_I_ROW_FLOOR, RIM_A5_NODES, RIM_A5_PACE, estimateRimRow, paceAt } from './pacing';

const rows = RIM_A5_PACE.map((r) => estimateRimRow(r, paceAt));

describe('Rim pacing', () => {
  it('has one row per quest, its node count is the pinned one, and every route resolves', () => {
    expect(RIM_A5_PACE.map((r) => r.quest).sort()).toEqual([...RIM_A5_QUEST_IDS].sort());
    for (const r of RIM_A5_PACE) {
      expect(r.nodes, r.quest).toBe(RIM_A5_NODES[r.quest as keyof typeof RIM_A5_NODES]);
      for (const a of r.route) expect(() => paceAt(a), `${r.quest} ${a}`).not.toThrow();
    }
  });
  it(`every row is at ${PHASE_I_ROW_FLOOR * 100}% of its design minutes or better`, () => {
    for (const r of rows) expect(r.share, r.quest).toBeGreaterThanOrEqual(PHASE_I_ROW_FLOOR);
  });
  it('an unknown anchor throws rather than counting as the origin', () => {
    expect(() => paceAt('caldera.q.nowhere')).toThrow(/no anchor/);
  });
  it('a local beat widens the estimate', () => {
    const m48 = RIM_A5_PACE.find((r) => r.quest === 'm48')!;
    expect(estimateRimRow(m48, paceAt).beatS).toBeGreaterThan(estimateRimRow({ ...m48, local: {} }, paceAt).beatS);
  });
});
