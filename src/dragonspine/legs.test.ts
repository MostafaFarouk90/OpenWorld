import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { LEG_TARGETS, legLengths } from './legs';
import { buildDragonspine } from './layout';
import { registerDragonspineKinds } from './structureKinds';
import { stubInputs } from './testing/fixture';

let release: () => void;
beforeAll(() => (release = registerDragonspineKinds()));
afterAll(() => release());

const b = buildDragonspine(stubInputs());
const legs = legLengths(b);
const within = (actual: number, target: number, pct = 0.15) => Math.abs(actual - target) <= target * pct;

describe('leg lengths (the plan\'s table, computed from the layout)', () => {
  it('computes all seven quests and prints the table', () => {
    expect(Object.keys(legs)).toEqual(Object.keys(LEG_TARGETS));
    const rows = Object.entries(legs).map(([q, l]) => `${q}: ridden ${l.ridden} m (target ${LEG_TARGETS[q]!.ridden}), foot ${l.foot} m (target ${LEG_TARGETS[q]!.foot}) - ${l.note}`);
    console.log(`Dragonspine leg lengths on the stand-in ground:\n${rows.join('\n')}`);
    for (const l of Object.values(legs)) {
      expect(l.ridden).toBeGreaterThanOrEqual(0);
      expect(l.foot).toBeGreaterThan(0);
    }
  });

  /** Legs that are not this layout's to fix, reported instead: the reason says whose numbers decide them. */
  const STRUCTURAL: Record<string, string> = {
    'M30.ridden': 'the road from the shelter to the Anvil is K1\'s polyline (the plan\'s 1,100 m does not fit K1\'s positions)',
    'R18.ridden': 'shelter and cliff foot positions are K1\'s; the plan\'s lodge-to-foot 600 m does not fit them',
    'R17.foot': 'the walk from the road to each pad is the pad offset (about 10 m each way), fixed by the road verge',
    'M29.ridden': 'n/a: the shelter waystone is the start, nothing is ridden',
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
  });
});
