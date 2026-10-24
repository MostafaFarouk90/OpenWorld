import { describe, expect, it } from 'vitest';
import { CINDERREACH_LAYOUT } from '../cinderreach/cinderreach.layout';
import { HARROWMARK_LAYOUT } from '../harrowmark/harrowmark.layout';
import { ACT2_PACE, paceMinutes } from '../quests/content/act2/pacing';
import { OLDSMOKE_LAYOUT } from '../oldsmoke/oldsmoke.layout';
import { OLDSMOKE_PACE } from '../quests/content/act2/oldsmoke/pacing';
import { M17R08_PACE, M17R08_POS } from '../quests/content/act2/oldsmoke/mines/m17r08.pacing';
import { M18M19_PACE, M18M19_POS, paceMinutesFollow } from '../quests/content/act2/oldsmoke/mines/m18m19.pacing';
import { M20D04_LOCAL_ANCHORS, M20D04_PACE } from '../quests/content/act2/oldsmoke/mines/m20d04.pacing';
import {
  ACT2_BEAT_S, ACT2_TRAVEL_CAP, BEAT_S, DOOR_LEG_M, PHASE_D_DESIGN, ROUTE_FOLLOW_MPS, RIDE_MPS, WALK_MPS, cappedTravelS, estimatePaceRow, trailNodes,
} from './timing';

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


/** Plan Part 7, Phase D rows (design minutes, travel counted, talk and beats, estimate; all minutes). */
const PART7_D: Record<string, { design: number; travel: number; talk: number; estimate: number }> = {
  m16: { design: 45, travel: 7.1, talk: 16.5, estimate: 23.6 },
  m17: { design: 45, travel: 1.9, talk: 21.5, estimate: 23.4 },
  r09: { design: 35, travel: 2.2, talk: 17.2, estimate: 19.4 },
  r08: { design: 40, travel: 1.9, talk: 16.4, estimate: 18.3 },
  m18: { design: 50, travel: 2.6, talk: 21.3, estimate: 23.9 },
  r10: { design: 45, travel: 1.9, talk: 19.7, estimate: 21.5 },
  m19: { design: 50, travel: 5.0, talk: 18.0, estimate: 23.0 },
  m20: { design: 45, travel: 0.7, talk: 19.8, estimate: 20.6 },
  m21: { design: 40, travel: 1.1, talk: 17.3, estimate: 18.4 },
  d04: { design: 65, travel: 3.3, talk: 29.5, estimate: 32.8 },
  m22: { design: 45, travel: 1.5, talk: 20.2, estimate: 21.6 },
};

describe('Part 7 arithmetic, Phase D (exact against the plan table)', () => {
  it('the design minutes the estimator reads are the plan\'s', () => {
    expect(Object.fromEntries(Object.entries(PART7_D).map(([q, r]) => [q, r.design]))).toEqual(PHASE_D_DESIGN);
  });
  it.each(Object.entries(PART7_D))('%s: travel and talk add to the estimate, travel is under the cap, the estimate clears 40%% of design', (_q, r) => {
    expect(Math.abs(r.travel + r.talk - r.estimate)).toBeLessThanOrEqual(0.15);
    expect(r.travel).toBeLessThanOrEqual(r.talk * ACT2_TRAVEL_CAP + 0.05);
    expect(r.estimate).toBeGreaterThanOrEqual(r.design * 0.4);
  });
  it('Phase D is 505 design minutes and the whole act (965) is at 50% of design', () => {
    const designD = Object.values(PART7_D).reduce((s, r) => s + r.design, 0);
    const estD = Object.values(PART7_D).reduce((s, r) => s + r.estimate, 0);
    const designC = Object.values(PART7).reduce((s, r) => s + r.design, 0);
    const estC = Object.values(PART7).reduce((s, r) => s + r.estimate, 0);
    expect(designD).toBe(505);
    expect(designC + designD).toBe(965);
    expect((estC + estD) / (designC + designD)).toBeGreaterThanOrEqual(0.5);
  });
});

describe('shipped Phase D content against the floors (one-sided: over is fine, under fails)', () => {
  const surface: Record<string, { x: number; z: number }> = {};
  for (const a of [...CINDERREACH_LAYOUT.anchors, ...HARROWMARK_LAYOUT.anchors, ...OLDSMOKE_LAYOUT.anchors]) surface[a.id] = { x: a.x, z: a.z };
  const rows = [
    ...OLDSMOKE_PACE.map((r) => ({ id: `${r.quest}${r.branch ? ':' + r.branch : ''}`, quest: r.quest, minutes: paceMinutes(r, surface).minutes })),
    ...M17R08_PACE.map((r) => ({ id: r.quest, quest: r.quest, minutes: paceMinutes(r, M17R08_POS).minutes })),
    ...M18M19_PACE.map((r) => ({ id: r.quest, quest: r.quest, minutes: paceMinutesFollow(r, M18M19_POS).minutes })),
    ...M20D04_PACE.map((r) => ({ id: r.quest, quest: r.quest, minutes: paceMinutes(r, M20D04_LOCAL_ANCHORS).minutes })),
  ];
  it('every quest has a row, and every branch row clears 40% of the quest\'s design minutes', () => {
    expect([...new Set(rows.map((r) => r.quest))].sort()).toEqual(Object.keys(PHASE_D_DESIGN).sort());
    for (const r of rows) expect(r.minutes, r.id).toBeGreaterThanOrEqual(PHASE_D_DESIGN[r.quest] * 0.4);
  });
});

describe('estimatePaceRow (the Phase D estimator on real anchors and played nodes)', () => {
  const at = (id: string) => ({ a: { x: 0, z: 0 }, b: { x: 90, z: 0 }, far: { x: 9000, z: 0 } })[id as 'a' | 'b' | 'far'];
  const row = { quest: 'm16', route: ['a', 'b'], beats: {} as Record<string, number> };
  it('walks a leg at the walking pace, a mounted leg at the canter and a followed leg at Wenna\'s pace', () => {
    expect(estimatePaceRow(row, 10, at, 100).travelS).toBeCloseTo(90 / WALK_MPS, 6);
    expect(estimatePaceRow({ ...row, rideLegs: 1 }, 10, at, 100).travelS).toBeCloseTo(90 / RIDE_MPS, 6);
    expect(estimatePaceRow({ ...row, follow: 1 }, 10, at, 100).travelS).toBeCloseTo(90 / ROUTE_FOLLOW_MPS, 6);
  });
  it('counts no travel across a door, lift or ride between frames (a leg over the door length)', () => {
    const far = estimatePaceRow({ ...row, route: ['a', 'far'] }, 10, at, 100);
    expect(far.travelM).toBe(0);
    expect(9000).toBeGreaterThan(DOOR_LEG_M);
  });
  it('caps travel at 3/7 of the talk-and-beats time and prices nodes and beats from the table', () => {
    const e = estimatePaceRow({ ...row, route: ['a', 'b', 'a', 'b', 'a', 'b', 'a', 'b'], beats: { search: 3, lift: 2 } }, 10, at, 2);
    expect(e.talkS).toBe(2 * 20);
    expect(e.beatS).toBe(3 * ACT2_BEAT_S.search + 2 * ACT2_BEAT_S.lift);
    expect(e.estimateMin * 60).toBeCloseTo((cappedTravelS(e.travelS, e.talkS + e.beatS) + e.talkS + e.beatS), 6);
    expect(e.estimateMin * 60).toBeLessThanOrEqual((1 + ACT2_TRAVEL_CAP) * (e.talkS + e.beatS) + 1e-9);
  });
  it('reads a trail\'s nodes without the readable notes', () => {
    expect(trailNodes({ talks: [{ npc: 'slagg', dialogueId: 'npc-slagg', nodes: 5 }, { npc: 'note-m17-board', dialogueId: 'note-m17-board', nodes: 3 }, { npc: 'pike', dialogueId: 'npc-pike', nodes: 2 }] })).toBe(7);
  });
});
