import { PLACEHOLDER_SAMPLE_RATE } from './proceduralSounds';

/**
 * The small synth kit the placeholder sound effects are built from (wyrm, Act 2 ground enemies, raid carts, the
 * Weeping Bellows). Everything is deterministic (seeded noise, no `Math.random`), mono and CC0, so a render is
 * identical between runs and tests can pin it.
 */
export const SR = PLACEHOLDER_SAMPLE_RATE;
export const TAU = Math.PI * 2;

/** Deterministic white noise in [-1, 1]. */
export function noise(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return (s / 0xffffffff) * 2 - 1;
  };
}

/** One-pole low-pass coefficient for a cutoff in Hz. */
export function coef(hz: number): number {
  return 1 - Math.exp((-TAU * Math.min(hz, SR * 0.45)) / SR);
}

/** A stateful one-pole low-pass; the cutoff may change per call. */
export function lowpass(hz = 1000): (x: number, cutoffHz?: number) => number {
  let y = 0;
  let k = coef(hz);
  return (x, cutoffHz) => {
    if (cutoffHz !== undefined) k = coef(cutoffHz);
    y += k * (x - y);
    return y;
  };
}

/** A stateful one-pole high-pass (the input minus its low-pass). */
export function highpass(hz = 1000): (x: number, cutoffHz?: number) => number {
  const lp = lowpass(hz);
  return (x, cutoffHz) => x - lp(x, cutoffHz);
}

/** A band between two cutoffs: the low-pass at `hi` minus the low-pass at `lo`. */
export function bandpass(lo: number, hi: number): (x: number, centreHz?: number) => number {
  const a = lowpass(hi);
  const b = lowpass(lo);
  return (x, centreHz) => {
    if (centreHz === undefined) return a(x) - b(x);
    return a(x, centreHz * 1.4) - b(x, centreHz * 0.7);
  };
}

/** A phase accumulator: call with the frequency of this sample, get the phase in radians. */
export function phasor(): (hz: number) => number {
  let p = 0;
  return (hz) => {
    p += (TAU * hz) / SR;
    return p;
  };
}

/** A band-limited-ish saw (4 harmonics are enough at these pitches) from a phase. */
export function saw(phase: number, harmonics = 8): number {
  let s = 0;
  for (let k = 1; k <= harmonics; k++) s += Math.sin(phase * k) / k;
  return s * 0.6;
}

/** Linear attack to 1 over `attack` seconds, then an exponential-ish release over the rest of `seconds`. */
export function env(t: number, seconds: number, attack: number, curve = 2): number {
  const u = Math.min(1, Math.max(0, t / seconds));
  return Math.min(1, t / Math.max(attack, 1e-4)) * Math.pow(1 - u, curve);
}

/** A decaying hit: instant attack, exponential fall at `rate` per second. */
export function hit(t: number, rate: number): number {
  return t < 0 ? 0 : Math.exp(-t * rate);
}

/** Soft clip, for grit. */
export function drive(x: number, amount: number): number {
  return Math.tanh(x * amount) / Math.tanh(amount);
}

/** Renders `seconds` of `fn(t, i)` into mono samples, clamped to [-1, 1] with a 3 ms fade at each end. */
export function render(seconds: number, fn: (t: number, i: number) => number): Float32Array<ArrayBuffer> {
  const n = Math.round(seconds * SR);
  const out = new Float32Array(n);
  const edge = Math.round(0.003 * SR);
  for (let i = 0; i < n; i++) {
    const fade = Math.min(1, i / edge, (n - 1 - i) / edge);
    out[i] = Math.max(-1, Math.min(1, fn(i / SR, i) * fade));
  }
  return out;
}
