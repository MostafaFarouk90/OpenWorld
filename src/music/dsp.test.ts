import { describe, expect, it } from 'vitest';
import { Biquad, TAU, onePole, pluck, rng, sawBlep, smooth, soften } from './dsp';

const SR = 44100;
const rms = (a: ArrayLike<number>, from = 0, to = a.length): number => {
  let s = 0;
  for (let i = from; i < to; i++) s += a[i] * a[i];
  return Math.sqrt(s / (to - from));
};
const tone = (hz: number, n: number, sr = SR): Float32Array => Float32Array.from({ length: n }, (_, i) => Math.sin((TAU * hz * i) / sr));
const run = (f: Biquad, x: Float32Array): Float32Array => x.map((v) => f.process(v));

/** Fundamental by autocorrelation over lags for 60..1500 Hz. */
function pitchOf(x: Float32Array, sr: number): number {
  let best = 0;
  let bestLag = 0;
  for (let lag = Math.floor(sr / 1500); lag <= Math.floor(sr / 60); lag++) {
    let c = 0;
    for (let i = 0; i + lag < x.length; i++) c += x[i] * x[i + lag];
    if (c > best) {
      best = c;
      bestLag = lag;
    }
  }
  return sr / bestLag;
}

describe('rng', () => {
  it('is deterministic per seed, in range, and differs between seeds', () => {
    const a = rng(5);
    const b = rng(5);
    const c = rng(6);
    const xs = Array.from({ length: 50 }, a);
    expect(Array.from({ length: 50 }, b)).toEqual(xs);
    expect(Array.from({ length: 50 }, c)).not.toEqual(xs);
    expect(xs.every((v) => v >= -1 && v <= 1)).toBe(true);
  });
});

describe('Biquad', () => {
  it('low-pass passes a low tone and removes a high one', () => {
    const lo = run(new Biquad('lowpass', 1000, 0.7, SR), tone(100, SR)).slice(4000);
    const hi = run(new Biquad('lowpass', 1000, 0.7, SR), tone(8000, SR)).slice(4000);
    expect(rms(lo)).toBeGreaterThan(0.6);
    expect(rms(hi)).toBeLessThan(0.02);
  });
  it('high-pass is the mirror image', () => {
    const lo = run(new Biquad('highpass', 3000, 0.7, SR), tone(100, SR)).slice(4000);
    const hi = run(new Biquad('highpass', 3000, 0.7, SR), tone(9000, SR)).slice(4000);
    expect(rms(lo)).toBeLessThan(0.01);
    expect(rms(hi)).toBeGreaterThan(0.6);
  });
  it('band-pass favours its centre', () => {
    const centre = rms(run(new Biquad('bandpass', 2000, 2, SR), tone(2000, SR)).slice(4000));
    const away = rms(run(new Biquad('bandpass', 2000, 2, SR), tone(200, SR)).slice(4000));
    expect(centre).toBeGreaterThan(5 * away);
  });
  it('is stable at an extreme cutoff and a low sample rate (an impulse decays)', () => {
    for (const [fc, q, sr] of [[40000, 0.7, 8000], [5, 10, 8000], [20000, 0.1, 44100]] as const) {
      const f = new Biquad('lowpass', fc, q, sr);
      let peak = Math.abs(f.process(1));
      for (let i = 0; i < 20000; i++) peak = Math.max(peak, Math.abs(f.process(0)));
      expect(Number.isFinite(peak)).toBe(true);
      expect(peak).toBeLessThan(5);
      expect(Math.abs(f.process(0))).toBeLessThan(1e-3);
    }
  });
});

describe('small helpers', () => {
  it('onePole is a coefficient in (0, 1) even above Nyquist', () => {
    for (const fc of [1, 500, 20000, 1e6]) {
      const k = onePole(fc, 8000);
      expect(k).toBeGreaterThan(0);
      expect(k).toBeLessThan(1);
    }
  });
  it('sawBlep stays within a small margin of +/-1 and rises across the cycle', () => {
    const dt = 220 / SR;
    let phase = 0;
    let min = 0;
    let max = 0;
    for (let i = 0; i < SR; i++) {
      phase += dt;
      if (phase >= 1) phase -= 1;
      const y = sawBlep(phase, dt);
      min = Math.min(min, y);
      max = Math.max(max, y);
    }
    expect(max).toBeLessThan(1.1);
    expect(min).toBeGreaterThan(-1.1);
    expect(sawBlep(0.25, dt)).toBeLessThan(sawBlep(0.75, dt));
  });
  it('soften is bounded, odd, and nearly linear for small input', () => {
    expect(Math.abs(soften(50, 1.5))).toBeLessThanOrEqual(1 / 1.5 + 1e-9);
    expect(soften(-0.3)).toBeCloseTo(-soften(0.3), 12);
    expect(soften(0.01)).toBeCloseTo(0.01, 4);
  });
  it('smooth clamps to 0..1', () => {
    expect([smooth(-2), smooth(0), smooth(0.5), smooth(1), smooth(7)]).toEqual([0, 0, 0.5, 1, 1]);
  });
});

describe('pluck', () => {
  it.each([[147, 44100], [294, 44100], [587, 44100]])('sounds at %d Hz (sample rate %d) within 15 cents', (hz, sr) => {
    const x = pluck(hz, sr, 0.5, 0.5, 0.6, 3);
    const got = pitchOf(x.slice(Math.floor(sr * 0.05)), sr);
    expect(Math.abs(1200 * Math.log2(got / hz))).toBeLessThan(15);
  });
  it('stays finite and audible at the 8 kHz test rate', () => {
    const x = pluck(220, 8000, 0.5, 0.5, 0.6, 3);
    expect(x.every(Number.isFinite)).toBe(true);
    expect(rms(x)).toBeGreaterThan(0.01);
  });
  it('decays, is deterministic per seed and finite', () => {
    const a = pluck(220, SR, 1.5, 0.5, 0.5, 9);
    expect(pluck(220, SR, 1.5, 0.5, 0.5, 9)).toEqual(a);
    expect(pluck(220, SR, 1.5, 0.5, 0.5, 10)).not.toEqual(a);
    expect(a.every(Number.isFinite)).toBe(true);
    expect(rms(a, 0, 4410)).toBeGreaterThan(3 * rms(a, a.length - 4410));
  });
  it('a brighter pluck has more high-frequency energy', () => {
    const energy = (x: Float32Array): number => {
      let s = 0;
      for (let i = 1; i < x.length; i++) s += (x[i] - x[i - 1]) ** 2;
      return s;
    };
    expect(energy(pluck(220, SR, 0.3, 0.9, 0.5, 1))).toBeGreaterThan(energy(pluck(220, SR, 0.3, 0.1, 0.5, 1)));
  });
  it('has no DC offset from the excitation', () => {
    const x = pluck(147, SR, 1, 0.5, 0.5, 4);
    const mean = x.reduce((s, v) => s + v, 0) / x.length;
    expect(Math.abs(mean)).toBeLessThan(0.01);
  });
});
