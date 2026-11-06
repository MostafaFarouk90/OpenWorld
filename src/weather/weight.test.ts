import { describe, expect, it } from 'vitest';
import { edgeFade, insideDepth, phaseWeight, ramp } from './weight';

const waste = { x0: 7000, z0: 4500, x1: 15000, z1: 11000 };

describe('storm weight', () => {
  it('measures depth inside and outside the box', () => {
    expect(insideDepth(waste, 10000, 4600)).toBe(100);
    expect(insideDepth(waste, 10000, 4450)).toBe(-50);
    expect(insideDepth(waste, 6997, 4496)).toBeCloseTo(-5, 9);
  });

  it('fades over the edge band: 0 at 150 m outside, 1 at 50 m inside', () => {
    expect(edgeFade(-150)).toBe(0);
    expect(edgeFade(-200)).toBe(0);
    expect(edgeFade(50)).toBe(1);
    expect(edgeFade(-50)).toBeCloseTo(0.5, 9);
    // Ashgate (about 50 m south of the edge) sees half a storm to the north.
    expect(edgeFade(insideDepth(waste, 10000, 4450))).toBeCloseTo(0.5, 9);
  });

  it('weights the phases', () => {
    expect(phaseWeight('clear')).toBe(0);
    expect(phaseWeight('warning')).toBe(0.2);
    expect(phaseWeight('storm')).toBe(1);
  });

  it('ramps over 3 s either way and ignores bad steps', () => {
    let w = 0;
    for (let i = 0; i < 90; i++) w = ramp(w, 1, 1 / 60);
    expect(w).toBeCloseTo(0.5, 6);
    for (let i = 0; i < 200; i++) w = ramp(w, 1, 1 / 60);
    expect(w).toBe(1);
    expect(ramp(0.4, 0, 3)).toBe(0);
    expect(ramp(0.4, 1, Number.NaN)).toBe(0.4);
  });
});
