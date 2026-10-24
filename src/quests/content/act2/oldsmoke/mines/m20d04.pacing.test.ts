// M20 and D04 pacing (plans/act2-A13.md section 5): each quest clears its floor and 40% of its design minutes. the routes read A4's real
// mine anchors (realAnchors.ts).
import { describe, expect, it } from 'vitest';
import { paceMinutes } from '../../pacing';
import { M20D04_LOCAL_ANCHORS, M20D04_PACE } from './m20d04.pacing';
import { M20_NOTES } from './m20.quest';
import { D04_NOTES } from './d04.quest';

describe('M20 and D04 pacing', () => {
  it('holds a row for each quest, each floor under its design minutes', () => {
    expect(M20D04_PACE.map((r) => r.quest)).toEqual(['m20', 'd04']);
    for (const r of M20D04_PACE) expect(r.floor).toBeLessThan(r.design);
    expect(M20D04_PACE.map((r) => [r.design, r.floor])).toEqual([[45, 18], [65, 26]]);
  });

  it.each(M20D04_PACE.map((r) => [r.quest, r] as const))('%s: its estimate stays over its floor and 40% of its design minutes', (_q, row) => {
    const minutes = paceMinutes(row, M20D04_LOCAL_ANCHORS).minutes;
    expect(minutes).toBeGreaterThanOrEqual(row.floor);
    expect(minutes / row.design).toBeGreaterThanOrEqual(0.4);
  });

  it('every route anchor has a local position, and a missing one throws', () => {
    for (const r of M20D04_PACE) for (const a of r.route) expect(M20D04_LOCAL_ANCHORS[a], a).toBeDefined();
    expect(() => paceMinutes({ ...M20D04_PACE[0], route: ['oldsmoke.m20.nowhere', 'oldsmoke.lower.lift'] }, M20D04_LOCAL_ANCHORS)).toThrow(/unknown anchor/);
  });

  it('the beat counts match the quests: eight stewards, five chains, seven notes; fourteen kills, six notes, two pools', () => {
    const [m20, d04] = M20D04_PACE;
    expect(m20.beats).toMatchObject({ killUnit: 8, interact: 5, note: M20_NOTES.length });
    expect(d04.beats).toMatchObject({ killUnit: 10 + 1 + 3, note: D04_NOTES.length, puzzle: 2, lift: 2, boss: 1 });
  });

  it('the estimate responds to dialogue and to beats', () => {
    for (const base of M20D04_PACE) {
      expect(paceMinutes({ ...base, nodes: base.nodes - 10 }, M20D04_LOCAL_ANCHORS).minutes).toBeLessThan(paceMinutes(base, M20D04_LOCAL_ANCHORS).minutes);
      expect(paceMinutes({ ...base, beats: {} }, M20D04_LOCAL_ANCHORS).minutes).toBeLessThan(paceMinutes(base, M20D04_LOCAL_ANCHORS).minutes);
    }
  });

  it('prints the estimates the plan quotes (M20 about 22.6, D04 about 34.5)', () => {
    const est = Object.fromEntries(M20D04_PACE.map((r) => [r.quest, paceMinutes(r, M20D04_LOCAL_ANCHORS).minutes]));
    expect(est.m20).toBeGreaterThan(20);
    expect(est.d04).toBeGreaterThan(30);
  });
});
