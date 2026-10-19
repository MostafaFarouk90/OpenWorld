// Small deterministic DSP kit for the procedural stems: seeded noise, filters, a band-limited saw
// and a plucked string. Everything is sample by sample on plain Float32Arrays so it renders in
// Node (tests, previews) and in the browser with identical output.

export const TAU = Math.PI * 2;

/** Seeded white noise in -1..1 (the same LCG the stems have always used). */
export function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return (s / 0xffffffff) * 2 - 1;
  };
}

export type BiquadType = 'lowpass' | 'highpass' | 'bandpass';

/** RBJ biquad. The cutoff is clamped under Nyquist so a low test sample rate stays stable. */
export class Biquad {
  private b0 = 0;
  private b1 = 0;
  private b2 = 0;
  private a1 = 0;
  private a2 = 0;
  private x1 = 0;
  private x2 = 0;
  private y1 = 0;
  private y2 = 0;

  constructor(type: BiquadType, cutoff: number, q: number, sampleRate: number) {
    this.set(type, cutoff, q, sampleRate);
  }

  set(type: BiquadType, cutoff: number, q: number, sampleRate: number): void {
    const fc = Math.min(Math.max(cutoff, 10), sampleRate * 0.45);
    const w = (TAU * fc) / sampleRate;
    const cos = Math.cos(w);
    const alpha = Math.sin(w) / (2 * Math.max(q, 0.1));
    let b0: number;
    let b1: number;
    let b2: number;
    if (type === 'lowpass') {
      b0 = (1 - cos) / 2;
      b1 = 1 - cos;
      b2 = b0;
    } else if (type === 'highpass') {
      b0 = (1 + cos) / 2;
      b1 = -(1 + cos);
      b2 = b0;
    } else {
      b0 = alpha;
      b1 = 0;
      b2 = -alpha;
    }
    const a0 = 1 + alpha;
    this.b0 = b0 / a0;
    this.b1 = b1 / a0;
    this.b2 = b2 / a0;
    this.a1 = (-2 * cos) / a0;
    this.a2 = (1 - alpha) / a0;
  }

  process(x: number): number {
    const y = this.b0 * x + this.b1 * this.x1 + this.b2 * this.x2 - this.a1 * this.y1 - this.a2 * this.y2;
    this.x2 = this.x1;
    this.x1 = x;
    this.y2 = this.y1;
    this.y1 = y;
    return y;
  }
}

/** One-pole low-pass coefficient for `process: y += k * (x - y)`. */
export function onePole(cutoff: number, sampleRate: number): number {
  return 1 - Math.exp((-TAU * Math.min(cutoff, sampleRate * 0.45)) / sampleRate);
}

/** Band-limited sawtooth (polyBLEP) from a phase in 0..1 and the per-sample phase increment. */
export function sawBlep(phase: number, dt: number): number {
  let y = 2 * phase - 1;
  if (phase < dt) {
    const t = phase / dt;
    y -= t + t - t * t - 1;
  } else if (phase > 1 - dt) {
    const t = (phase - 1) / dt;
    y -= t * t + t + t + 1;
  }
  return y;
}

/** Gentle saturation: soft-clips toward +/-1 and keeps small signals linear. */
export function soften(x: number, drive = 1): number {
  return Math.tanh(x * drive) / drive;
}

export function smooth(x: number): number {
  const c = x < 0 ? 0 : x > 1 ? 1 : x;
  return c * c * (3 - 2 * c);
}

/**
 * Karplus-Strong plucked string rendered into a buffer. `brightness` (0..1) sets the excitation
 * low-pass, `sustain` (0..1) the loop gain; a first-order all-pass tunes the pitch to a fraction of
 * a sample.
 */
export function pluck(hz: number, sampleRate: number, seconds: number, brightness: number, sustain: number, seed: number): Float32Array {
  const n = Math.max(1, Math.round(seconds * sampleRate));
  const out = new Float32Array(n);
  const period = sampleRate / hz;
  const len = Math.max(2, Math.floor(period - 1));
  const d = period - 0.5 - len; // fractional delay the all-pass must supply, in (0.5, 1.5)
  const a = (1 - d) / (1 + d);
  const line = new Float32Array(len);
  const r = rng(seed);
  const k = 0.15 + 0.8 * brightness;
  let lp = 0;
  for (let i = 0; i < len; i++) {
    lp += k * (r() - lp);
    line[i] = lp;
  }
  // Remove the DC the shaped burst carries, so the string does not thump.
  let mean = 0;
  for (let i = 0; i < len; i++) mean += line[i];
  mean /= len;
  for (let i = 0; i < len; i++) line[i] -= mean;
  const gain = 0.97 + 0.0295 * Math.min(1, Math.max(0, sustain));
  let pos = 0;
  let prev = 0;
  let apX = 0;
  let apY = 0;
  for (let i = 0; i < n; i++) {
    const cur = line[pos];
    const filtered = 0.5 * (cur + prev) * gain;
    prev = cur;
    const y = a * filtered + apX - a * apY;
    apX = filtered;
    apY = y;
    line[pos] = y;
    out[i] = cur;
    pos = pos + 1 === len ? 0 : pos + 1;
  }
  return out;
}
