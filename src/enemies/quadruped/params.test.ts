import { describe, expect, it } from 'vitest';
import { HORSE_PROPORTIONS, HOUND, quadrupedDims, validateParams } from './params';

describe('params', () => {
  it('HOUND is valid, frozen and lower than the horse stub', () => {
    expect(() => validateParams(HOUND)).not.toThrow();
    expect(Object.isFrozen(HOUND)).toBe(true);
    expect(HORSE_PROPORTIONS.legLength).toBeGreaterThan(HOUND.legLength);
  });

  it('derived dims put the spine so straight legs reach y = 0', () => {
    const d = quadrupedDims(HOUND);
    expect(d.spineRestY + d.hipY - d.upperLen - d.lowerLen).toBeCloseTo(0, 12);
    expect(d.hipZFront).toBeLessThan(0);
    expect(d.hipZBack).toBeGreaterThan(0);
    expect(d.tailLen).toBe(HOUND.tailLength);
    expect(quadrupedDims({ ...HOUND, tailLength: undefined }).tailLen).toBeCloseTo(HOUND.bodyLength * 0.6, 12);
  });

  it('rejects zero, negative and non-finite values', () => {
    for (const bad of [0, -1, NaN, Infinity]) expect(() => validateParams({ ...HOUND, headSize: bad })).toThrow(RangeError);
    expect(() => validateParams({ ...HOUND, scale: 0 })).toThrow(RangeError);
    expect(() => validateParams({ ...HOUND, gaitSpeedScale: -2 })).toThrow(RangeError);
  });
});
