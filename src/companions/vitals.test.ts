import { describe, expect, it } from 'vitest';
import { COMPANION_DOWNED_SECONDS } from './tuning';
import { CompanionVitals, VITALS_TUNING } from './vitals';

describe('CompanionVitals (downed rule)', () => {
  it('takes damage and goes down at 0, kneels 8 s, then stands at 30%', () => {
    const v = new CompanionVitals(200, COMPANION_DOWNED_SECONDS);
    expect(v.take(50)).toBeNull();
    expect(v.health).toBe(150);
    expect(v.take(500)).toBe('downed');
    expect(v.health).toBe(0);
    expect(v.downed).toBe(true);
    // Nothing more lands while kneeling.
    expect(v.take(10)).toBeNull();
    let edge = null;
    let t = 0;
    while (!edge && t < 20) {
      edge = v.tick(0.5, true);
      t += 0.5;
    }
    expect(edge).toBe('stood');
    expect(t).toBeCloseTo(COMPANION_DOWNED_SECONDS, 5);
    expect(v.downed).toBe(false);
    expect(v.health).toBeCloseTo(200 * VITALS_TUNING.standFraction);
  });

  it('regenerates out of combat only, up to max', () => {
    const v = new CompanionVitals(100, 8);
    v.take(50);
    v.tick(1, true);
    expect(v.health).toBe(50);
    v.tick(1, false);
    expect(v.health).toBeCloseTo(52);
    for (let i = 0; i < 100; i++) v.tick(1, false);
    expect(v.health).toBe(100);
  });

  it('restore ends a kneel at full health and reports it; bad amounts are ignored', () => {
    const v = new CompanionVitals(100, 8);
    expect(v.take(Number.NaN)).toBeNull();
    expect(v.take(-5)).toBeNull();
    expect(v.restore()).toBeNull();
    v.take(100);
    expect(v.restore()).toBe('stood');
    expect(v.health).toBe(100);
    expect(v.downed).toBe(false);
    expect(v.tick(0, false)).toBeNull();
  });
});
