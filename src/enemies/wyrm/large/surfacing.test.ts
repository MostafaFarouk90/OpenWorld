import { describe, expect, it } from 'vitest';
import { WYRM_SHAPE } from '../builder/params';
import { crossed, headYFor } from './surfacing';

const water = { surface: 6, floor: 3 };

describe('surfacing (K6a water form)', () => {
  it('hidden is under the bed, swimming just above the surface, reared well above it, monotonic between', () => {
    const s = 4.5;
    expect(headYFor(0, s, water)).toBeLessThan(water.floor);
    const swim = headYFor(0.5, s, water);
    expect(swim).toBeGreaterThan(water.surface);
    expect(swim - water.surface).toBeLessThan(WYRM_SHAPE.chestRadius * s);
    expect(headYFor(1, s, water)).toBeGreaterThan(water.surface + WYRM_SHAPE.headHeight * s * 2);
    let prev = -Infinity;
    for (let k = 0; k <= 1.0001; k += 0.05) {
      const y = headYFor(k, s, water);
      expect(y).toBeGreaterThanOrEqual(prev);
      prev = y;
    }
  });

  it('clamps a lift outside 0..1 and treats NaN as hidden', () => {
    expect(headYFor(-3, 2, water)).toBe(headYFor(0, 2, water));
    expect(headYFor(9, 2, water)).toBe(headYFor(1, 2, water));
    expect(headYFor(NaN, 2, water)).toBe(headYFor(0, 2, water));
  });

  it('crossed reports breaking and leaving the surface only on the crossing tick', () => {
    expect(crossed(5, 6.2, 6)).toBe(1);
    expect(crossed(6.2, 5, 6)).toBe(-1);
    expect(crossed(6.2, 7, 6)).toBe(0);
    expect(crossed(4, 5, 6)).toBe(0);
  });
});
