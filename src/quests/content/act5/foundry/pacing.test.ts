// The Foundry rows on the Act 4 estimator (the shipped convention: a note is one search beat): every route resolves on real
// anchors and every row sits at the Act 5 plan's line (51%) or better.
import { describe, expect, it } from 'vitest';
import { estimateAct4Row } from '../../../../integration/act4Timing';
import { FOUNDRY_A5_QUEST_IDS } from './foundry.content';
import { FOUNDRY_A5_PACE, paceAt } from './pacing';

const rows = FOUNDRY_A5_PACE.map((r) => estimateAct4Row(r, paceAt));
export const ACT5_ROW_LINE = 0.51;

describe('Foundry pacing', () => {
  it('has one row per quest and every route resolves', () => {
    expect(FOUNDRY_A5_PACE.map((r) => r.quest).sort()).toEqual([...FOUNDRY_A5_QUEST_IDS].sort());
    for (const r of FOUNDRY_A5_PACE) for (const a of r.route) expect(() => paceAt(a), `${r.quest} ${a}`).not.toThrow();
  });
  it('every row at 51% or more', () => {
    console.log(rows.map((r) => `${r.quest} travel ${Math.round(r.travelM)} m counted ${(r.countedTravelS / 60).toFixed(1)} talk+beats ${((r.talkS + r.beatS) / 60).toFixed(1)} est ${r.estimateMin.toFixed(1)} ${(r.share * 100).toFixed(1)}%`).join('\n'));
    for (const r of rows) expect(r.share, r.quest).toBeGreaterThanOrEqual(ACT5_ROW_LINE);
  });
  it('the Act 5 pacing pass keeps the watch points (D09, M54, D10) at 54% or more', () => {
    for (const q of ['d09', 'm54', 'd10']) expect(rows.find((r) => r.quest === q)!.share, q).toBeGreaterThanOrEqual(0.54);
  });
});
