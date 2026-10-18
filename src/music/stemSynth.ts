import { BARLEY_SYNTH, loopSamples, type TrackDef, type TrackSynth, type TuneNote } from './tracks';

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
    // Every note ends in a short fade to zero so none is cut off mid-sound (that would click).
    const fade = Math.max(1, Math.min(Math.floor(n * 0.2), Math.round(0.01 * this.sampleRate)));
    for (let i = 0; i < n; i++) {
      const idx = (startSample + i) % this.length;
      const tail = n - i <= fade ? (n - i - 1) / fade : 1;
      this.data[idx] += voice(i / this.sampleRate, i) * tail;
    }
  }

  /** Scales the stem to exactly `peak` (up or down) and returns the data. */
  finish(peak = 0.15): Float32Array {
    let max = 0;
    for (let i = 0; i < this.length; i++) max = Math.max(max, Math.abs(this.data[i]));
    if (max > 0) {
      const k = peak / max;
      for (let i = 0; i < this.length; i++) this.data[i] *= k;
    }
    return this.data;
  }
}

interface Ctx {
  syn: TrackSynth;
  /** Frequency of a semitone offset from the tonic. */
  d(semitones: number): number;
  /** Semitone offset of scale degree `n` (may exceed one octave) plus `octave` octaves. */
  degree(n: number, octave?: number): number;
}

function ctxFor(syn: TrackSynth): Ctx {
  return {
    syn,
    d: (semitones) => syn.tonic * 2 ** (semitones / 12),
    degree(n, octave = 0) {
      const oct = Math.floor(n / 7);
      return syn.scale[((n % 7) + 7) % 7] + 12 * (oct + octave);
    },
  };
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

function kick(t: Track, g: Grid, c: Ctx): void {
  for (let bar = 0; bar < g.bars; bar++) {
    tokens(c.syn.pattern[bar % 2]).forEach((tok, step) => {
      if (tok !== 'B') return;
      t.add(g.start(bar, step), 0.28, (s) => Math.sin(TAU * (48 + 70 * Math.exp(-s * 28)) * s) * Math.exp(-s * 9) * 0.9);
    });
  }
}

function snare(t: Track, g: Grid, c: Ctx): void {
  const r = rng(7);
  for (let bar = 0; bar < g.bars; bar++) {
    tokens(c.syn.pattern[bar % 2]).forEach((tok, step) => {
      if (tok !== 'K') return;
      if (c.syn.voices.snare === 'rimshot') {
        // Marching rimshot: a bright click on top of a short woody body.
        let prev = 0;
        t.add(g.start(bar, step), 0.1, (s) => {
          const x = r();
          const high = x - prev;
          prev = x;
          return (high * Math.exp(-s * 160) * 0.9 + Math.sin(TAU * 1850 * s) * Math.exp(-s * 220) * 0.5 + Math.sin(TAU * 410 * s) * Math.exp(-s * 55) * 0.7) * 0.7;
        });
        return;
      }
      // Finger-snap and light clap: a short bandpassed noise tick and a soft tone.
      let low = 0;
      t.add(g.start(bar, step), 0.18, (s) => {
        low += 0.45 * (r() - low);
        return (low * Math.exp(-s * 26) * 1.4 + Math.sin(TAU * 190 * s) * Math.exp(-s * 40) * 0.35) * 0.7;
      });
    });
  }
}

function hat(t: Track, g: Grid, c: Ctx): void {
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
    tokens(c.syn.pattern[bar % 2]).forEach((tok, step) => {
      if (tok === 't') hit(g.start(bar, step), false);
      else if (tok === 'ts') hit(g.start(bar, step), true);
    });
    if (bar >= g.bars / 2) {
      tokens(c.syn.bHatExtra[bar % 2]).forEach((tok, step) => {
        if (tok === 't') hit(g.start(bar, step), false);
      });
    }
  }
}

// Bass roots per bar come from the track's synth data and repeat every four bars.

function bass(t: Track, g: Grid, c: Ctx): void {
  for (let bar = 0; bar < g.bars; bar++) {
    const roots = bar < g.bars / 2 ? c.syn.bassA : c.syn.bassB;
    const root = c.degree(roots[bar % 4], -1);
    const f = c.d(root);
    const chest = c.syn.voices.vocal === 'throat-chant';
    // Four hummed quarter notes per bar; the third and fourth step up an octave-fifth for movement.
    for (let q = 0; q < 4; q++) {
      const hz = q === 3 ? c.d(root + 7) : f;
      if (chest) {
        // Chest-voice bass: a rounder, more formant-heavy tone with a short chiff at the onset.
        t.add(g.start(bar, q * 4), g.stepSeconds * 4.2, (s) => {
          const env = Math.min(1, s / 0.015) * Math.exp(-s * 2.6);
          const w = TAU * hz * s;
          return env * (Math.sin(w) * 0.55 + Math.sin(2 * w) * 0.3 + Math.sin(3 * w) * 0.12 + Math.sin(w * 0.5) * 0.15) * 0.8;
        });
        continue;
      }
      t.add(g.start(bar, q * 4), g.stepSeconds * 4.2, (s) => {
        const env = Math.min(1, s / 0.02) * Math.exp(-s * 2.2);
        return env * (Math.sin(TAU * hz * s) * 0.6 + Math.sin(TAU * hz * 2 * s) * 0.15) * 0.8;
      });
    }
  }
}

function vocal(t: Track, g: Grid, c: Ctx): void {
  const r = rng(29);
  for (let bar = 0; bar < g.bars; bar++) {
    const aHalf = bar < g.bars / 2;
    const hz = c.d(c.degree((aHalf ? c.syn.vocalA : c.syn.vocalB)[bar % 4], 0));
    if (c.syn.voices.vocal === 'throat-chant') {
      chant(t, g, bar, c.d(c.degree((aHalf ? c.syn.vocalA : c.syn.vocalB)[bar % 4], -1)));
      continue;
    }
    // Warm chest hum: low harmonics, slow vibrato, swelling across the bar.
    t.add(g.start(bar, 0), g.barSeconds * 0.96, (s) => {
      const swell = Math.sin((Math.PI * s) / (g.barSeconds * 0.96)) ** 1.5;
      const vib = 1 + 0.006 * Math.sin(TAU * 5 * s);
      const w = TAU * hz * vib * s;
      return swell * (Math.sin(w) + Math.sin(2 * w) * 0.38 + Math.sin(3 * w) * 0.22) * 0.35;
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

function melody(t: Track, g: Grid, c: Ctx): void {
  const beatSamples = g.barSamples / 4;
  const place = (tune: readonly TuneNote[], startBar: number): void => {
    let cursor = startBar * g.barSamples;
    for (const [deg, beats] of tune) {
      const hz = c.d(c.degree(deg, 1));
      const seconds = (beats * beatSamples) / t.sampleRate;
      if (c.syn.voices.melody === 'trumpet') {
        const maxK = Math.max(1, Math.min(8, Math.floor((t.sampleRate * 0.45) / hz)));
        t.add(Math.round(cursor), seconds * 0.97, (s) => {
          const env = Math.min(1, s / 0.03) * Math.min(1, (seconds - s) / 0.05 + 0.2) * Math.exp(-s * 0.3);
          // Lip trill: vibrato plus a quick flutter that wobbles both pitch and loudness.
          const flutter = Math.sin(TAU * 7 * s);
          const vib = 1 + 0.012 * Math.min(1, s / 0.15) * Math.sin(TAU * 5.5 * s) + 0.006 * flutter;
          const w = TAU * hz * vib * s;
          let sum = 0;
          for (let k = 1; k <= maxK; k++) sum += Math.sin(k * w) / k ** 0.8;
          // Buzzy lip noise rides on the odd harmonics' phase, deterministic and noise-free.
          const buzz = Math.sin(w * 0.5 + 0.8 * Math.sin(w * 3)) * 0.15;
          return env * (1 + 0.15 * flutter) * (sum * 0.38 + buzz) * 0.5;
        });
        cursor += beats * beatSamples;
        continue;
      }
      t.add(Math.round(cursor), seconds * 0.97, (s) => {
        const env = Math.min(1, s / 0.04) * Math.min(1, (seconds - s) / 0.06 + 0.2) * Math.exp(-s * 0.4);
        const vib = 1 + 0.01 * Math.min(1, s / 0.3) * Math.sin(TAU * 5.5 * s);
        return env * Math.sin(TAU * hz * vib * s) * 0.5;
      });
      cursor += beats * beatSamples;
    }
  };
  place(c.syn.tuneA, 0);
  place(c.syn.tuneB, g.bars / 2);
}

/** Boss stem: slow tolling chant a third lower than the vocal, under a gong-like tone every two bars. */
function boss(t: Track, g: Grid, c: Ctx): void {
  if (c.syn.voices.boss === 'steam-anvil') {
    steamAnvil(t, g, c);
    return;
  }
  for (let bar = 0; bar < g.bars; bar += 2) {
    const toll = c.d(c.degree(0, -1) - 3);
    t.add(g.start(bar, 0), g.barSeconds * 2, (s) => {
      const env = Math.min(1, s / 0.01) * Math.exp(-s * 0.9);
      const gong = Math.sin(TAU * toll * 2.76 * s) * 0.3 + Math.sin(TAU * toll * 1.0 * s) * 0.6 + Math.sin(TAU * toll * 4.1 * s) * 0.15;
      return env * gong * 0.7;
    });
  }
  for (let bar = 0; bar < g.bars; bar++) {
    const hz = c.d(c.degree(0, 0) - 3);
    t.add(g.start(bar, 0), g.barSeconds * 0.96, (s) => {
      const swell = Math.sin((Math.PI * s) / (g.barSeconds * 0.96)) ** 2;
      return swell * (Math.sin(TAU * hz * s) + 0.4 * Math.sin(TAU * hz * 2 * s)) * 0.3;
    });
  }
}

/** Unison throat chant "ha-la, ha-la": two detuned low voices through a pair of vowel resonances. */
function chant(t: Track, g: Grid, bar: number, hz: number): void {
  // Formant centres (Hz) for "ha" (open a) and "la" (darker a), one syllable per beat.
  const vowels = [[700, 1150], [520, 1500]] as const;
  const maxFor = (f: number): number => Math.max(1, Math.min(14, Math.floor((t.sampleRate * 0.45) / f)));
  for (let q = 0; q < 4; q++) {
    const [f1, f2] = vowels[q % 2];
    const dur = g.stepSeconds * 3.6;
    t.add(g.start(bar, q * 4), dur, (s) => {
      // Pulses on the beat: fast attack, quick decay to a sustained throat drone.
      const env = Math.min(1, s / 0.012) * (0.45 + 0.55 * Math.exp(-s * 9));
      let sum = 0;
      for (const detune of [0.997, 1.004]) {
        const f0 = hz * detune;
        const w = TAU * f0 * s;
        const top = maxFor(f0);
        for (let k = 1; k <= top; k++) {
          const fk = k * f0;
          const res = 1 / (1 + ((fk - f1) / 140) ** 2) + 0.7 / (1 + ((fk - f2) / 220) ** 2);
          sum += (Math.sin(k * w) / k) * (0.25 + 1.6 * res);
        }
      }
      return env * sum * 0.22;
    });
  }
}

/** Boss stem: hissing steam breath under clanking anvil tongue-clicks. */
function steamAnvil(t: Track, g: Grid, c: Ctx): void {
  const r = rng(41);
  for (let bar = 0; bar < g.bars; bar++) {
    let prev = 0;
    const dur = g.barSeconds * 0.96;
    t.add(g.start(bar, 0), dur, (s) => {
      const x = r();
      const high = x - prev;
      prev = x;
      // Breath swells and exhales twice per bar.
      const breath = Math.sin((Math.PI * s * 2) / dur) ** 2;
      return high * breath * 0.3;
    });
    const base = c.d(c.degree(0, 2));
    for (const step of [4, 12]) {
      t.add(g.start(bar, step), 0.3, (s) => {
        const env = Math.min(1, s / 0.002) * Math.exp(-s * 16);
        const clank =
          Math.sin(TAU * base * s) * 0.5 + Math.sin(TAU * base * 2.76 * s) * 0.35 + Math.sin(TAU * base * 5.4 * s) * 0.25 + Math.sin(TAU * base * 8.93 * s) * 0.12;
        return env * clank * 0.8 + r() * Math.exp(-s * 200) * 0.5;
      });
    }
  }
}

/** Per-stem peak so the summed combat and boss mixes stay under full scale at the mixer's output. */
const STEM_PEAK: Record<string, number> = { kick: 0.4, snare: 0.36, hat: 0.28, bass: 0.4, vocal: 0.32, melody: 0.24, boss: 0.1 };

const VOICES: Record<string, (t: Track, g: Grid, c: Ctx) => void> = { kick, snare, hat, bass, vocal, melody, boss };

/** Renders one placeholder stem as exactly `loopSamples(track, sampleRate)` mono samples. */
export function synthStem(track: TrackDef, stemId: string, sampleRate: number): Float32Array {
  const voice = VOICES[stemId];
  if (!voice) throw new Error(`No placeholder synth for stem "${stemId}"`);
  const length = loopSamples(track, sampleRate);
  const t = new Track(length, sampleRate);
  voice(t, grid(track, length, sampleRate), ctxFor(track.synth ?? BARLEY_SYNTH));
  return t.finish(STEM_PEAK[stemId] ?? 0.15);
}
