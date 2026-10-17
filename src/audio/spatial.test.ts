import { describe, expect, it } from 'vitest';
import { AUDIO } from '../config/constants';
import { exponentialGain } from './spatial';

const ROLLOFF = AUDIO.rolloffFactor;

describe('exponentialGain', () => {
  it('returns 1 at distance 0', () => {
    expect(exponentialGain(0, 1, ROLLOFF)).toBe(1);
  });

  it('returns 1 at and inside the reference distance', () => {
    expect(exponentialGain(5, 5, ROLLOFF)).toBe(1);
    expect(exponentialGain(2, 5, ROLLOFF)).toBe(1);
  });

  it('returns 2^-rolloff at twice the reference distance', () => {
    expect(exponentialGain(2, 1, ROLLOFF)).toBeCloseTo(Math.pow(2, -1.5), 10);
    expect(exponentialGain(8, 4, ROLLOFF)).toBeCloseTo(Math.pow(2, -1.5), 10);
  });

  it('returns 10^-rolloff at ten times the reference distance', () => {
    expect(exponentialGain(10, 1, ROLLOFF)).toBeCloseTo(Math.pow(10, -1.5), 10);
    expect(exponentialGain(30, 3, ROLLOFF)).toBeCloseTo(Math.pow(10, -1.5), 10);
  });

  it('strictly decreases beyond the reference distance', () => {
    let previous = exponentialGain(1, 1, ROLLOFF);
    for (const d of [1.1, 2, 5, 10, 50, 100]) {
      const gain = exponentialGain(d, 1, ROLLOFF);
      expect(gain).toBeLessThan(previous);
      previous = gain;
    }
  });

  it('throws RangeError for a non-positive reference distance', () => {
    expect(() => exponentialGain(1, 0, ROLLOFF)).toThrow(RangeError);
    expect(() => exponentialGain(1, -1, ROLLOFF)).toThrow(RangeError);
    expect(() => exponentialGain(1, Number.NaN, ROLLOFF)).toThrow(RangeError);
  });
});
