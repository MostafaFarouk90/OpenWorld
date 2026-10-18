import { loopSamples, type TrackDef } from './tracks';

// Procedural placeholder stems for "Barley and Brazier" until recorded beatbox stems exist. Every
// stem is exactly loopSamples() long. Notes that ring past the end of the loop wrap around to the
// start, so the loop seam is continuous without any special casing.

const TAU = Math.PI * 2;

function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return (s / 0xffffffff) * 2 - 1;
  };
}

/** Beatbox notation from design 6.3: `B` kick, `K` snare, `t` closed hat, `ts` open hat, `-` rest. */
const PATTERN_BARS: readonly string[] = [
  'B - t - K - t - B - t B K - ts -',
  'B - t - K - t t B - t - K - t ts',
];

/** Extra hat ghost notes in the B half so the variation is audible. */
const B_HALF_HAT_EXTRA: readonly string[] = [
  '- t - - - t - t - - - t - t - -',
  '- - t - - - - - t - - - t - - t',
];

function tokens(bar: string): string[] {
  return bar.trim().split(/\s+/);
}

type Voice = (t: number, n: number) => number;

class Track {
  readonly data: Float32Array;
  constructor(
    readonly length: number,
    readonly sampleRate: number,
  ) {
    this.data = new Float32Array(length);
  }

  /** Adds a note starting at `startSample` lasting `seconds`; indices wrap around the loop end. */
  add(startSample: number, seconds: number, voice: Voice): void {
    const n = Math.max(1, Math.round(seconds * this.sampleRate));
    for (let i = 0; i < n; i++) {
      const idx = (startSample + i) % this.length;
      this.data[idx] += voice(i / this.sampleRate, i);
    }
  }

  /** Scales to a safe peak and returns the data. */
  finish(peak = 0.8): Float32Array {
    let max = 0;
    for (let i = 0; i < this.length; i++) max = Math.max(max, Math.abs(this.data[i]));
    if (max > peak) {
      const k = peak / max;
      for (let i = 0; i < this.length; i++) this.data[i] *= k;
    }
    return this.data;
  }
}

const d = (semitonesFromD3: number): number => 146.83 * 2 ** (semitonesFromD3 / 12);
// D natural minor: D E F G A Bb C, semitone offsets from D.
const MINOR = [0, 2, 3, 5, 7, 8, 10];
function degree(n: number, octave = 0): number {
  const oct = Math.floor(n / 7);
  return MINOR[((n % 7) + 7) % 7] + 12 * (oct + octave);
}

interface Grid {
  bars: number;
  barSamples: number;
  stepSamples: number;
  barSeconds: number;
  stepSeconds: number;
  start(bar: number, step: number): number;
}

function grid(track: TrackDef, length: number, sampleRate: number): Grid {
  const barSamples = length / track.bars;
  const stepSamples = barSamples / 16;
  return {
    bars: track.bars,
    barSamples,
    stepSamples,
    barSeconds: barSamples / sampleRate,
    stepSeconds: stepSamples / sampleRate,
    start: (bar, step) => Math.round(bar * barSamples + step * stepSamples),
  };
}

function kick(t: Track, g: Grid): void {
  for (let bar = 0; bar < g.bars; bar++) {
    tokens(PATTERN_BARS[bar % 2]).forEach((tok, step) => {
      if (tok !== 'B') return;
      t.add(g.start(bar, step), 0.28, (s) => Math.sin(TAU * (48 + 70 * Math.exp(-s * 28)) * s) * Math.exp(-s * 9) * 0.9);
    });
  }
}

function snare(t: Track, g: Grid): void {
  const r = rng(7);
  for (let bar = 0; bar < g.bars; bar++) {
    tokens(PATTERN_BARS[bar % 2]).forEach((tok, step) => {
      if (tok !== 'K') return;
      // Finger-snap and light clap: a short bandpassed noise tick and a soft tone.
      let low = 0;
      t.add(g.start(bar, step), 0.18, (s) => {
        low += 0.45 * (r() - low);
        return (low * Math.exp(-s * 26) * 1.4 + Math.sin(TAU * 190 * s) * Math.exp(-s * 40) * 0.35) * 0.7;
      });
    });
  }
}

function hat(t: Track, g: Grid): void {
  const r = rng(13);
  const hit = (start: number, open: boolean): void => {
    let prev = 0;
    t.add(start, open ? 0.14 : 0.05, (s) => {
      const x = r();
      const high = x - prev; // crude high-pass for a tongue tick
      prev = x;
      return high * Math.exp(-s * (open ? 22 : 70)) * 0.35;
    });
  };
  for (let bar = 0; bar < g.bars; bar++) {
    tokens(PATTERN_BARS[bar % 2]).forEach((tok, step) => {
      if (tok === 't') hit(g.start(bar, step), false);
      else if (tok === 'ts') hit(g.start(bar, step), true);
    });
    if (bar >= g.bars / 2) {
      tokens(B_HALF_HAT_EXTRA[bar % 2]).forEach((tok, step) => {
        if (tok === 't') hit(g.start(bar, step), false);
      });
    }
  }
}

// Bass roots per bar (scale degrees), repeated every four bars; B half walks differently.
const BASS_A = [0, 0, 5, 4];
const BASS_B = [0, 2, 5, 4];

function bass(t: Track, g: Grid): void {
  for (let bar = 0; bar < g.bars; bar++) {
    const roots = bar < g.bars / 2 ? BASS_A : BASS_B;
    const root = degree(roots[bar % 4], -1);
    const f = d(root);
    // Four hummed quarter notes per bar; the third and fourth step up an octave-fifth for movement.
    for (let q = 0; q < 4; q++) {
      const hz = q === 3 ? d(root + 7) : f;
      t.add(g.start(bar, q * 4), g.stepSeconds * 4.2, (s) => {
        const env = Math.min(1, s / 0.02) * Math.exp(-s * 2.2);
        return env * (Math.sin(TAU * hz * s) * 0.6 + Math.sin(TAU * hz * 2 * s) * 0.15) * 0.8;
      });
    }
  }
}

function vocal(t: Track, g: Grid): void {
  const r = rng(29);
  for (let bar = 0; bar < g.bars; bar++) {
    const aHalf = bar < g.bars / 2;
    const hz = d(degree(aHalf ? [0, 0, 2, 0][bar % 4] : [0, 4, 2, 0][bar % 4], 0));
    // Warm chest hum: low harmonics, slow vibrato, swelling across the bar.
    t.add(g.start(bar, 0), g.barSeconds * 0.96, (s) => {
      const swell = Math.sin((Math.PI * s) / (g.barSeconds * 0.96)) ** 1.5;
      const vib = 1 + 0.006 * Math.sin(TAU * 5 * s);
      let sum = 0;
      for (let h = 1; h <= 4; h++) sum += Math.sin(TAU * hz * vib * h * s) / h ** 1.4;
      return swell * sum * 0.35;
    });
    // Open "hoh" calls on the off-beat of every other bar (A half) or every bar (B half).
    if (!aHalf || bar % 2 === 1) {
      let low = 0;
      t.add(g.start(bar, 10), 0.3, (s) => {
        low += 0.12 * (r() - low);
        const env = Math.min(1, s / 0.02) * Math.exp(-s * 9);
        return env * (Math.sin(TAU * hz * 1.5 * s) * 0.5 + low * 1.5) * 0.45;
      });
    }
  }
}

// Whistled folk tune: [scale degree, quarter-note beats] per phrase; A is bars 1-8, B bars 9-16.
const TUNE_A: ReadonlyArray<readonly [number, number]> = [
  [7, 2], [9, 1], [8, 1], [7, 2], [4, 2], [5, 2], [6, 2], [7, 4],
  [9, 2], [10, 1], [9, 1], [8, 2], [7, 2], [6, 2], [4, 2], [5, 4],
];
const TUNE_B: ReadonlyArray<readonly [number, number]> = [
  [11, 2], [10, 1], [9, 1], [8, 2], [7, 2], [9, 3], [8, 1], [7, 4],
  [4, 1], [5, 1], [6, 2], [7, 2], [9, 2], [8, 2], [6, 2], [7, 4],
];

function melody(t: Track, g: Grid): void {
  const beatSamples = g.barSamples / 4;
  const place = (tune: ReadonlyArray<readonly [number, number]>, startBar: number): void => {
    let cursor = startBar * g.barSamples;
    for (const [deg, beats] of tune) {
      const hz = d(degree(deg, 1));
      const seconds = (beats * beatSamples) / t.sampleRate;
      t.add(Math.round(cursor), seconds * 0.97, (s) => {
        const env = Math.min(1, s / 0.04) * Math.min(1, (seconds - s) / 0.06 + 0.2) * Math.exp(-s * 0.4);
        const vib = 1 + 0.01 * Math.min(1, s / 0.3) * Math.sin(TAU * 5.5 * s);
        return env * Math.sin(TAU * hz * vib * s) * 0.5;
      });
      cursor += beats * beatSamples;
    }
  };
  place(TUNE_A, 0);
  place(TUNE_B, g.bars / 2);
}

/** Boss stem: slow tolling chant a third lower than the vocal, under a gong-like tone every two bars. */
function boss(t: Track, g: Grid): void {
  for (let bar = 0; bar < g.bars; bar += 2) {
    const toll = d(degree(0, -1) - 3);
    t.add(g.start(bar, 0), g.barSeconds * 2, (s) => {
      const env = Math.min(1, s / 0.01) * Math.exp(-s * 0.9);
      const gong = Math.sin(TAU * toll * 2.76 * s) * 0.3 + Math.sin(TAU * toll * 1.0 * s) * 0.6 + Math.sin(TAU * toll * 4.1 * s) * 0.15;
      return env * gong * 0.7;
    });
  }
  for (let bar = 0; bar < g.bars; bar++) {
    const hz = d(degree(0, 0) - 3);
    t.add(g.start(bar, 0), g.barSeconds * 0.96, (s) => {
      const swell = Math.sin((Math.PI * s) / (g.barSeconds * 0.96)) ** 2;
      return swell * (Math.sin(TAU * hz * s) + 0.4 * Math.sin(TAU * hz * 2 * s)) * 0.3;
    });
  }
}

const VOICES: Record<string, (t: Track, g: Grid) => void> = { kick, snare, hat, bass, vocal, melody, boss };

/** Renders one placeholder stem as exactly `loopSamples(track, sampleRate)` mono samples. */
export function synthStem(track: TrackDef, stemId: string, sampleRate: number): Float32Array {
  const voice = VOICES[stemId];
  if (!voice) throw new Error(`No placeholder synth for stem "${stemId}"`);
  const length = loopSamples(track, sampleRate);
  const t = new Track(length, sampleRate);
  voice(t, grid(track, length, sampleRate));
  return t.finish();
}
