import { describe, expect, it } from 'vitest';
import { CINDERREACH_LAYOUT } from '../../../cinderreach/cinderreach.layout';
import { HARROWMARK_LAYOUT } from '../../../harrowmark/harrowmark.layout';
import { ACT2_PACE, paceMinutes, type PaceRow } from './pacing';

const pos: Record<string, { x: number; z: number }> = {};
for (const a of [...CINDERREACH_LAYOUT.anchors, ...HARROWMARK_LAYOUT.anchors]) pos[a.id] = { x: a.x, z: a.z };

/** Part 7: Phase C's design total, and the share the act must reach. */
const PHASE_C_DESIGN_MINUTES = 460;

describe('Phase C pacing (plans/act2-A12.md section 5)', () => {
  it('holds a row for each of the ten quests, each with a floor under its design minutes', () => {
    expect(ACT2_PACE.map((r) => r.quest)).toEqual(['m11', 'm12', 'r06', 'r05', 'm13', 'r07', 'r11', 'm14', 'm15', 'd03']);
    for (const r of ACT2_PACE) expect(r.floor, r.quest).toBeLessThan(r.design);
  });

  it.each(ACT2_PACE.map((r) => [r.quest, r] as const))('%s: its estimate stays over its floor', (_q, row) => {
    expect(paceMinutes(row, pos).minutes).toBeGreaterThanOrEqual(row.floor);
  });

  it('the act reaches half of the design total and the sum of floors', () => {
    const total = ACT2_PACE.reduce((s, r) => s + paceMinutes(r, pos).minutes, 0);
    expect(total).toBeGreaterThanOrEqual(PHASE_C_DESIGN_MINUTES * 0.5);
    expect(total).toBeGreaterThanOrEqual(ACT2_PACE.reduce((s, r) => s + r.floor, 0));
  });

  it('a quest that lost its fights, its dialogue or its walks would fall under: the estimate responds to each', () => {
    const base = ACT2_PACE.find((r) => r.quest === 'd03')!;
    const m = (row: PaceRow) => paceMinutes(row, pos).minutes;
    expect(m({ ...base, nodes: base.nodes - 10 })).toBeLessThan(m(base));
    expect(m({ ...base, beats: { ...base.beats, killUnit: 0 } })).toBeLessThan(m(base));
    expect(m({ ...base, route: [base.route[0], base.route[1]] })).toBeLessThan(m(base));
  });

  it('refuses an unknown anchor, naming it', () => {
    expect(() => paceMinutes({ ...ACT2_PACE[0], route: ['nowhere.a', 'nowhere.b'] }, pos)).toThrow(/nowhere\.a/);
  });
});
