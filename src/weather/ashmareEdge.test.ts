import { describe, expect, it } from 'vitest';
import { AshmareEdge, deepest, outward } from './ashmareEdge';

const WASTE = { x0: 7000, z0: 4500, x1: 15000, z1: 11000 };

describe('the Ashmare at the Waste edge', () => {
  it('sets a rider down within 4 m of the edge and toasts once per approach', () => {
    const e = new AshmareEdge([WASTE]);
    expect(e.step(true, 10000, 4450).dismount).toBe(false); // Ashgate, 50 m out
    const first = e.step(true, 10000, 4497);
    expect(first).toMatchObject({ dismount: true, toast: true });
    expect(e.step(true, 10000, 4497)).toMatchObject({ dismount: true, toast: false });
    e.step(false, 10000, 4460); // walked back 40 m out
    expect(e.step(true, 10000, 4497)).toMatchObject({ dismount: true, toast: true });
  });

  it('never fires on foot', () => {
    const e = new AshmareEdge([WASTE]);
    expect(e.step(false, 10000, 4600).dismount).toBe(false);
  });

  it('finds the post fallback outside the nearest edge', () => {
    expect(outward(WASTE, 10000, 4498, 6)).toEqual({ x: 10000, z: 4492 });
    expect(outward(WASTE, 6998, 6000, 6)).toEqual({ x: 6992, z: 6000 });
    expect(deepest([], 0, 0).box).toBeNull();
  });
});
