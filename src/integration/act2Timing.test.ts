import { describe, expect, it } from 'vitest';
import { CINDERREACH_LAYOUT } from '../cinderreach/cinderreach.layout';
import { HARROWMARK_LAYOUT } from '../harrowmark/harrowmark.layout';
import { ACT2_PACE, paceMinutes } from '../quests/content/act2/pacing';
import { ACT2_BEAT_S, ACT2_TRAVEL_CAP, BEAT_S, ROUTE_FOLLOW_MPS, RIDE_MPS, WALK_MPS, cappedTravelS } from './timing';

/** Plan Part 7, Phase C rows: design minutes, travel counted, talk and beats, and the estimate (all minutes). */
const PART7: Record<string, { design: number; travel: number; talk: number; estimate: number }> = {
  m11: { design: 45, travel: 9.3, talk: 22.4, estimate: 31.7 },
  m12: { design: 50, travel: 1.5, talk: 26.1, estimate: 27.6 },
  r06: { design: 40, travel: 2.2, talk: 16.8, estimate: 19.1 },
  r05: { design: 35, travel: 3.3, talk: 16.8, estimate: 20.1 },
  m13: { design: 50, travel: 1.9, talk: 20.2, estimate: 22.1 },
  r07: { design: 35, travel: 2.6, talk: 14.3, estimate: 16.9 },
  r11: { design: 40, travel: 3.0, talk: 16.1, estimate: 19.0 },
  m14: { design: 55, travel: 4.4, talk: 20.8, estimate: 25.3 },
  m15: { design: 50, travel: 3.3, talk: 22.7, estimate: 26.0 },
  d03: { design: 60, travel: 2.2, talk: 26.2, estimate: 28.5 },
};

const pos: Record<string, { x: number; z: number }> = {};
for (const a of [...CINDERREACH_LAYOUT.anchors, ...HARROWMARK_LAYOUT.anchors]) pos[a.id] = { x: a.x, z: a.z };

describe('Act 2 estimator constants (plan Part 7)', () => {
  it('pins the new beat seconds and speeds', () => {
    expect(ACT2_BEAT_S).toMatchObject({ search: 20, carry: 15, waveEnemy: 45, herd: 45, duelRound: 90, rhythm: 60, puzzle: 120, lift: 30, set: 60 });
    expect(ROUTE_FOLLOW_MPS).toBe(2);
    expect(RIDE_MPS).toBe(9);
    expect(ACT2_TRAVEL_CAP).toBeCloseTo(3 / 7, 10);
  });
  it('leaves the Act 1 constants alone', () => {
    expect(BEAT_S).toMatchObject({ killUnit: 45, interact: 10, leap: 15, structure: 20, boss: 360, stealthSection: 240 });
    expect(WALK_MPS).toBe(4.5);
  });
  it('the travel cap only trims: under the cap it is the identity, over it equals 3/7 of the rest', () => {
    expect(cappedTravelS(100, 1000)).toBe(100);
    expect(cappedTravelS(1000, 700)).toBeCloseTo(300, 10);
    expect(cappedTravelS(0, 0)).toBe(0);
  });
});

/**
 * How far the shipped estimate may sit from the plan's Part 7 estimate before the two are said to have drifted apart. The
 * shipped routes and node counts were measured after the plan (M12's wave and carries added 12 min), so this is a guard
 * against gross drift (a route anchor renamed to nothing, a beat table emptied), not an exact match.
 */
const DRIFT = 0.5;

// Review B L5: this block used to check the PART7 literal against itself. It now ties the plan table to the shipped
// estimator, so either one changing alone fails here.
describe('Part 7 against the shipped estimator, Phase C', () => {
  it('the plan table and the shipped pacing table name the same quests', () => {
    expect(ACT2_PACE.map((r) => r.quest).sort()).toEqual(Object.keys(PART7).sort());
  });
  it.each(Object.keys(PART7))('%s: the shipped estimate (paceMinutes) is within 50%% of the plan\'s estimate', (q) => {
    const row = ACT2_PACE.find((r) => r.quest === q)!;
    const shipped = paceMinutes(row, pos).minutes;
    const plan = PART7[q].estimate;
    expect(Math.abs(shipped - plan) / plan, `${q}: shipped ${shipped.toFixed(1)} min, plan ${plan} min`).toBeLessThanOrEqual(DRIFT);
  });
  it('the shipped act sits within 50% of the plan\'s 460 design minutes at 51.4%', () => {
    const design = Object.values(PART7).reduce((s, r) => s + r.design, 0);
    const shipped = ACT2_PACE.reduce((s, r) => s + paceMinutes(r, pos).minutes, 0);
    const planned = Object.values(PART7).reduce((s, r) => s + r.estimate, 0);
    expect(Math.abs(shipped - planned) / planned).toBeLessThanOrEqual(DRIFT);
    expect(shipped / design).toBeGreaterThanOrEqual(0.5);
  });
});

describe('shipped Phase C content against the floors (one-sided: over is fine, under fails)', () => {
  const rows = ACT2_PACE.map((r) => ({ row: r, res: paceMinutes(r, pos) }));
  it.each(rows.map((x) => [x.row.quest, x] as const))('%s: the capped estimate clears 40%% of its design minutes', (q, x) => {
    expect(x.res.minutes, q).toBeGreaterThanOrEqual(PART7[q].design * 0.4);
  });
  it('travel never supplies more than the cap, and the cap never raises an estimate', () => {
    for (const { row, res } of rows) {
      expect(res.minutes, row.quest).toBeLessThanOrEqual(res.uncappedMinutes + 1e-9);
    }
  });
  it('the act as shipped is reported against 50% (reported, not failed) and clears the sum of floors', () => {
    const total = rows.reduce((s, x) => s + x.res.minutes, 0);
    const floors = Object.values(PART7).reduce((s, r) => s + r.design * 0.4, 0);
    expect(total).toBeGreaterThanOrEqual(floors);
    console.info(`[act2 timing] Phase C as shipped: ${total.toFixed(1)} min of 460 design = ${((total / 460) * 100).toFixed(1)}%`);
  });
});
