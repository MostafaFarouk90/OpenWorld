import { describe, expect, it } from 'vitest';
import { footstepSamples, landSamples } from './proceduralSounds';

const RATE = 44100;
const rms = (a: Float32Array, from = 0, to = a.length) => {
  let s = 0;
  for (let i = from; i < to; i++) s += a[i] * a[i];
  return Math.sqrt(s / Math.max(1, to - from));
};
const peakIndex = (a: Float32Array) => {
  let best = 0;
  for (let i = 1; i < a.length; i++) if (Math.abs(a[i]) > Math.abs(a[best])) best = i;
  return best;
};

describe.each([
  ['footstep v0', () => footstepSamples(0), 0.12],
  ['footstep v1', () => footstepSamples(1), 0.12],
  ['footstep v7', () => footstepSamples(7), 0.12],
  ['land', () => landSamples(), 0.25],
])('%s', (_name, gen, seconds) => {
  it('has the expected length', () => {
    expect(gen().length).toBe(Math.round(seconds * RATE));
  });
  it('is finite, within [-1, 1] and not silent', () => {
    const s = gen();
    for (const v of s) {
      expect(Number.isFinite(v)).toBe(true);
      expect(Math.abs(v)).toBeLessThanOrEqual(1);
    }
    expect(rms(s)).toBeGreaterThan(0.005);
  });
  it('peaks within the first 20 ms (fast attack)', () => {
    expect(peakIndex(gen())).toBeLessThan(0.02 * RATE);
  });
  it('decays: tail energy far below head energy', () => {
    const s = gen();
    const n = Math.floor(s.length * 0.2);
    expect(rms(s, s.length - n)).toBeLessThan(rms(s, 0, n) * 0.1);
  });
  it('is deterministic', () => {
    expect(Array.from(gen())).toEqual(Array.from(gen()));
  });
});

describe('sound variants and weight', () => {
  it('footstep variants differ', () => {
    expect(Array.from(footstepSamples(0))).not.toEqual(Array.from(footstepSamples(1)));
  });
  it('defaults to variant 0', () => {
    expect(Array.from(footstepSamples())).toEqual(Array.from(footstepSamples(0)));
  });
  it('landing is longer and louder than a step', () => {
    expect(landSamples().length).toBeGreaterThan(footstepSamples(0).length);
    expect(rms(landSamples())).toBeGreaterThan(rms(footstepSamples(0)));
  });
});
