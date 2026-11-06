// The Crossing's pad refit (PR 1's follow-up): the pad was 121 m and the roads cut through it to about 108.8 m, so the pad's
// untouched corners stood up to 5 m over the junction (8.6 m across the pad). The pad now sits at the roads' level: the pad's
// north and east edges read 109 m and the junction 108.3 m. What is left (about 6 m) is the south-west road's own grade
// coming in at 105 m, not the pad.
import { describe, expect, it } from 'vitest';
import { heightAt } from '../terrain/heightfield';
import { CROSSING, CROSSING_PLATEAU } from '../terrain/shape/waste';

describe('the Crossing pad', () => {
  it('sits at the roads level (109 m)', () => {
    expect(CROSSING_PLATEAU.height).toBe(109);
    expect(heightAt(CROSSING[0], CROSSING[1])).toBeCloseTo(108.3, 0);
  });
  it('has its untouched edges at the junction level, and no corner standing over it', () => {
    const { minX, maxX, minZ, maxZ } = CROSSING_PLATEAU.box;
    for (let x = minX + 10; x <= maxX; x += 10) expect(heightAt(x, maxZ)).toBeCloseTo(109, 0);
    for (let z = minZ + 10; z <= maxZ; z += 10) expect(heightAt(maxX, z)).toBeCloseTo(109, 0);
    const hs: number[] = [];
    for (let x = minX; x <= maxX; x += 10) for (let z = minZ; z <= maxZ; z += 10) hs.push(heightAt(x, z));
    expect(Math.max(...hs)).toBeLessThan(111.5);
    expect(Math.max(...hs) - Math.min(...hs)).toBeLessThan(6.5);
  });
});
