import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { LEG_TARGETS, legLengths } from './legs';
import { dragonspineBuild } from './layout';
import { registerDragonspineKinds } from './structureKinds';

let release: () => void;
beforeAll(() => (release = registerDragonspineKinds()));
afterAll(() => release());

// The shipped ground and K1's real inputs: the numbers are the ones a player walks.
const b = dragonspineBuild();
const legs = legLengths(b);
const within = (actual: number, target: number, pct = 0.15) => Math.abs(actual - target) <= target * pct;

describe('leg lengths (the plan\'s table, computed from the layout)', () => {
  it('computes all twelve quests and prints the table', () => {
    expect(Object.keys(legs)).toEqual(Object.keys(LEG_TARGETS));
    const rows = Object.entries(legs).map(([q, l]) => `${q}: ridden ${l.ridden} m (target ${LEG_TARGETS[q]!.ridden}), foot ${l.foot} m (target ${LEG_TARGETS[q]!.foot})${l.glide === undefined ? '' : `, glide ${l.glide} m (target ${LEG_TARGETS[q]!.glide})`} - ${l.note}`);
    console.log(`Dragonspine leg lengths on the shipped ground:\n${rows.join('\n')}`);
    expect(Object.keys(legs)).toHaveLength(12);
    for (const l of Object.values(legs)) {
      expect(l.ridden).toBeGreaterThanOrEqual(0);
      expect(l.foot).toBeGreaterThan(0);
    }
  });

  /** Legs that are not this layout's to fix, reported instead: the reason says whose numbers decide them. */
  const STRUCTURAL: Record<string, string> = {
    'M28.ridden': 'K1\'s crag stands about 453 m off the road and the routed climb is about 546 m, so the trailhead (the road point nearest the crag, within 400 m of the plan\'s 1,200 m) falls at about 800 m',
    'M30.ridden': 'the road from the shelter to the Anvil is K1\'s polyline, about 1.7 km (the plan\'s 1,100 m does not fit K1\'s positions)',
    'R17.foot': 'the walk from the road to each pad is the pad offset from the road verge (about 10 m each way), fixed by the road width',
    'R18.foot': 'K1\'s hawk-cliffs-path is about 296 m and the camp is a walk from its foot, so five trips are about 347 m each against the plan\'s 160 m',
    'R18.ridden': 'the plan\'s lodge-to-foot 600 m does not fit K1\'s positions: the cliff foot is about 2.3 km along the Spine Road from the lodge, plus the walkable route (about 760 m) to the path start',
    'M29.ridden': 'n/a: the shelter waystone is the start, nothing is ridden',
    'M33.ridden': 'K1\'s Skyhold spur is about 1,450 m from the summit gate to the cliff top (the plan\'s 800 m does not fit K1\'s positions); the ride is the spur',
  };
  /** The glide legs against the plan, reported the same way. */
  const GLIDE_STRUCTURAL: Record<string, string> = {
    D06: 'K1\'s summit-aerie lip and the Aerie\'s landing area are about 1,050 m apart across the chasm (the plan\'s 700 m); the glide is lip to landing marker',
  };

  it('lists every leg with its target: within 15% of the plan, or named in the structural list with a reason', () => {
    for (const [q, t] of Object.entries(LEG_TARGETS)) {
      for (const kind of ['ridden', 'foot'] as const) {
        const key = `${q}.${kind}`;
        const actual = legs[q]![kind];
        if (STRUCTURAL[key]) continue;
        expect(within(actual, t[kind]), `${key}: ${actual} m against ${t[kind]} m (+-15%)`).toBe(true);
      }
    }
    // The exemptions are real: each one is still out of range (a leg that comes back into range leaves the list).
    for (const key of Object.keys(STRUCTURAL)) {
      const [q, kind] = key.split('.') as [string, 'ridden' | 'foot'];
      expect(within(legs[q]![kind], LEG_TARGETS[q]![kind]), `${key} is now within 15%: remove it from STRUCTURAL`).toBe(false);
    }
    for (const [q, t] of Object.entries(LEG_TARGETS)) {
      if (t.glide === undefined) continue;
      const g = legs[q]!.glide!;
      expect(g, `${q}.glide`).toBeGreaterThan(0);
      expect(within(g, t.glide), `${q}.glide: ${g} m against ${t.glide} m: ${GLIDE_STRUCTURAL[q] ? 'now within 15%, remove it from GLIDE_STRUCTURAL' : 'out of range'}`).toBe(!GLIDE_STRUCTURAL[q]);
    }
  });
});
