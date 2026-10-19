import { Biquad, TAU, onePole, pluck, rng, sawBlep, smooth, soften } from './dsp';
import { BARLEY_SYNTH, loopSamples, type TrackDef, type TrackSynth, type TuneNote } from './tracks';

// Procedural placeholder stems until recorded ones exist. Every stem is exactly loopSamples() long.
// Notes that ring past the end of the loop wrap around to the start, so the loop seam is continuous
// without any special casing.
//
// The kit is built to sound played rather than triggered: filtered noise and body-and-click drums,
// a plucked lute, a warm detuned pad, a breathy flute, accents, small timing looseness, ghost notes
// and fills, and a dynamic arc across the sixteen bars.

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
      const idx = (((startSample + i) % this.length) + this.length) % this.length;
      const tail = n - i <= fade ? (n - i - 1) / fade : 1;
      this.data[idx] += voice(i / this.sampleRate, i) * tail;
    }
  }

  /** Mixes a rendered buffer in at `startSample` (wrapping), with the same short end fade. */
  addBuffer(startSample: number, buffer: Float32Array, gain: number): void {
    const n = buffer.length;
    const fade = Math.max(1, Math.min(Math.floor(n * 0.2), Math.round(0.01 * this.sampleRate)));
    for (let i = 0; i < n; i++) {
      const idx = (((startSample + i) % this.length) + this.length) % this.length;
      const tail = n - i <= fade ? (n - i - 1) / fade : 1;
      this.data[idx] += buffer[i] * gain * tail;
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
  /** Chord root scale degree under `bar`. */
  root(bar: number, bars: number): number;
}

function ctxFor(syn: TrackSynth): Ctx {
  const degree = (n: number, octave = 0): number => {
    const oct = Math.floor(n / 7);
    return syn.scale[((n % 7) + 7) % 7] + 12 * (oct + octave);
  };
  return {
    syn,
    d: (semitones) => syn.tonic * 2 ** (semitones / 12),
    degree,
    root(bar, bars) {
      const half = bar < bars / 2 ? (syn.chordA ?? syn.bassA) : (syn.chordB ?? syn.bassB);
      return half[((bar % 4) + 4) % 4];
    },
  };
}

interface Grid {
  bars: number;
  barSamples: number;
  stepSamples: number;
  barSeconds: number;
  stepSeconds: number;
  sampleRate: number;
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
    sampleRate,
    start: (bar, step) => Math.round(bar * barSamples + step * stepSamples),
  };
}

/** Loudness of the bar inside the loop: each four-bar phrase builds a little, the third peaks. */
function arc(bar: number, bars: number): number {
  const phrase = Math.min(3, Math.floor((bar * 4) / bars));
  const within = (((bar * 4) / bars) % 1);
  return [0.88, 0.95, 1, 0.92][phrase] * (0.95 + 0.05 * within);
}

/**
 * Human feel for one stem: off-beat sixteenths lag by the swing, and everything that is not on a
 * quarter note wanders a few milliseconds, from a seeded generator so the stem is reproducible.
 */
class Feel {
  private readonly r: () => number;
  constructor(
    private readonly g: Grid,
    private readonly c: Ctx,
    seed: number,
  ) {
    this.r = rng(seed);
  }

  /** Noise in -1..1 for velocity wobble. */
  rnd(): number {
    return this.r();
  }

  at(bar: number, step: number): number {
    const swing = this.c.syn.swing ?? 0;
    const jitter = this.c.syn.jitter ?? 0.005;
    const lag = step % 2 === 1 ? swing * this.g.stepSamples : 0;
    const wander = step % 4 === 0 ? 0 : this.r() * jitter * this.g.sampleRate;
    return Math.round(this.g.start(bar, step) + lag + wander);
  }
}

// --- drums ------------------------------------------------------------------------------------

/** Frame-drum thump: a quick pitch drop with a round body, a touch of the second partial and a beater click. */
function kickHit(t: Track, start: number, vel: number, r: () => number): void {
  const sr = t.sampleRate;
  const click = new Biquad('bandpass', 1800, 1.2, sr);
  let phase = 0;
  t.add(start, 0.34, (s) => {
    phase += (TAU * (56 + 95 * Math.exp(-s * 34))) / sr;
    const body = Math.sin(phase) * Math.exp(-s * 10.5) + 0.25 * Math.sin(2 * phase) * Math.exp(-s * 22);
    const beater = click.process(r()) * Math.exp(-s * 700) * 0.55;
    return soften((body * 1.1 + beater) * vel, 1.5) * 0.9;
  });
}

function kick(t: Track, g: Grid, c: Ctx): void {
  const feel = new Feel(g, c, 3);
  const r = rng(5);
  for (let bar = 0; bar < g.bars; bar++) {
    const a = arc(bar, g.bars);
    tokens(c.syn.pattern[bar % 2]).forEach((tok, step) => {
      if (tok !== 'B') return;
      const vel = (step % 4 === 0 ? 1 : 0.78) * (1 + 0.06 * feel.rnd()) * a;
      kickHit(t, feel.at(bar, step), vel, r);
    });
  }
}

function snareHit(t: Track, start: number, vel: number, style: TrackSynth['voices']['snare'], r: () => number): void {
  const sr = t.sampleRate;
  if (style === 'rimshot') {
    // Marching rimshot: a bright click over a short woody body.
    const hp = new Biquad('highpass', 2500, 0.8, sr);
    let phase = 0;
    t.add(start, 0.12, (s) => {
      phase += (TAU * (410 - 60 * Math.min(1, s * 25))) / sr;
      const click = hp.process(r()) * Math.exp(-s * 170) * 0.9;
      return (click + Math.sin(TAU * 1850 * s) * Math.exp(-s * 230) * 0.4 + Math.sin(phase) * Math.exp(-s * 52) * 0.7) * 0.7 * vel;
    });
    return;
  }
  // Hand clap and snap: three tight noise bursts and a soft tail through a band-pass, over a quiet shell.
  const hp = new Biquad('highpass', 700, 0.7, sr);
  const bp = new Biquad('bandpass', 2100, 0.9, sr);
  let phase = 0;
  t.add(start, 0.22, (s) => {
    phase += (TAU * (190 - 40 * Math.min(1, s * 18))) / sr;
    const claps = Math.exp(-s * 190) + (s > 0.009 ? 0.8 * Math.exp(-(s - 0.009) * 190) : 0) + (s > 0.019 ? 0.6 * Math.exp(-(s - 0.019) * 190) : 0);
    const noise = bp.process(hp.process(r()));
    return (noise * (claps * 0.8 + Math.exp(-s * 30) * 0.5) * 1.6 + Math.sin(phase) * Math.exp(-s * 38) * 0.35) * 0.7 * vel;
  });
}

function snare(t: Track, g: Grid, c: Ctx): void {
  const feel = new Feel(g, c, 7);
  const r = rng(11);
  const halfBars = g.bars / 2;
  for (let bar = 0; bar < g.bars; bar++) {
    const a = arc(bar, g.bars);
    tokens(c.syn.pattern[bar % 2]).forEach((tok, step) => {
      if (tok !== 'K') return;
      snareHit(t, feel.at(bar, step), (0.92 + 0.08 * feel.rnd()) * a, c.syn.voices.snare, r);
      // A quiet ghost note just before some backbeats in the second half.
      if (bar >= halfBars && step >= 2 && tokens(c.syn.pattern[bar % 2])[step - 2] !== 'K' && feel.rnd() > 0.1) snareHit(t, feel.at(bar, step - 2), 0.22 * a, c.syn.voices.snare, r);
    });
    // Phrase ends: a small pickup, and a short roll at the end of each half.
    if (bar % 4 === 3) {
      const roll = (bar + 1) % halfBars === 0;
      const pattern = tokens(c.syn.pattern[bar % 2]);
      const steps = (roll ? [13, 14, 15] : [15]).filter((step) => pattern[step] !== 'K'); // never flam a written snare
      steps.forEach((step, i) => snareHit(t, feel.at(bar, step), (roll ? 0.35 + 0.18 * i : 0.4) * a, c.syn.voices.snare, r));
    }
  }
}

function hat(t: Track, g: Grid, c: Ctx): void {
  const feel = new Feel(g, c, 13);
  const r = rng(17);
  const sr = t.sampleRate;
  const hit = (start: number, open: boolean, vel: number): void => {
    // A shaker or tongue tick: high-passed noise with a soft attack, not a click.
    const hp = new Biquad('highpass', 5200, 0.7, sr);
    const decay = open ? 16 : 55;
    t.add(start, open ? 0.2 : 0.07, (s) => hp.process(r()) * Math.min(1, s / 0.004) * Math.exp(-s * decay) * 0.6 * vel);
  };
  const accent = (step: number): number => (step % 4 === 0 ? 0.75 : step % 4 === 2 ? 0.95 : 0.5);
  for (let bar = 0; bar < g.bars; bar++) {
    const a = arc(bar, g.bars);
    tokens(c.syn.pattern[bar % 2]).forEach((tok, step) => {
      const vel = accent(step) * (1 + 0.1 * feel.rnd()) * a;
      if (tok === 't') hit(feel.at(bar, step), false, vel);
      else if (tok === 'ts') hit(feel.at(bar, step), true, vel);
    });
    if (bar >= g.bars / 2) {
      tokens(c.syn.bHatExtra[bar % 2]).forEach((tok, step) => {
        if (tok === 't') hit(feel.at(bar, step), false, 0.45 * (1 + 0.1 * feel.rnd()) * a);
      });
    }
  }
}

// --- bass, pad, lute --------------------------------------------------------------------------

/** One bass note: a band-limited saw and a sub sine through a closing low-pass, plucked rather than droned. */
function bassNote(t: Track, start: number, hz: number, seconds: number, vel: number, chest: boolean): void {
  const sr = t.sampleRate;
  const dt = hz / sr;
  const decay = Math.exp((chest ? -2.2 : -2.6) / sr);
  const sweep = Math.exp((chest ? -7 : -9) / sr);
  const top = chest ? 520 : 800;
  const floor = chest ? 120 : 160;
  let phase = 0;
  let env = 1;
  let cut = 1;
  let lp1 = 0;
  let lp2 = 0;
  t.add(start, seconds, (s) => {
    phase += dt;
    if (phase >= 1) phase -= 1;
    env *= decay;
    cut *= sweep;
    const k = onePole(floor + top * cut, sr);
    lp1 += k * (sawBlep(phase, dt) * 0.55 - lp1);
    lp2 += k * (lp1 - lp2);
    const sub = Math.sin(TAU * phase);
    return (lp2 * 1.4 + sub * (chest ? 0.7 : 0.55)) * Math.min(1, s / 0.006) * env * vel * 0.8;
  });
}

function bass(t: Track, g: Grid, c: Ctx): void {
  const feel = new Feel(g, c, 19);
  const chest = c.syn.voices.vocal === 'throat-chant';
  for (let bar = 0; bar < g.bars; bar++) {
    const a = arc(bar, g.bars);
    const root = c.degree(c.root(bar, g.bars), -1);
    // One scale degree under the next bar's root (wrapping from the last bar to the first).
    const approach = c.degree(c.root((bar + 1) % g.bars, g.bars) - 1, -1);
    const note = (step: number, semis: number, steps: number, vel: number): void =>
      bassNote(t, feel.at(bar, step), c.d(semis), g.stepSeconds * steps, vel * a, chest);
    if (bar % 4 === 3) {
      // Turn around into the next chord: root, fifth, root, then a step below the next root.
      note(0, root, 4.4, 1);
      note(4, root + 7, 4.4, 0.8);
      note(8, root, 4.4, 0.9);
      note(12, approach, 3.2, 0.85);
    } else {
      note(0, root, 6.4, 1);
      note(6, root + 7, 2.2, 0.65);
      note(8, root, 4.4, 0.9);
      if (bar % 2 === 1) note(12, root + 12, 2.6, 0.6);
    }
  }
}

/** A warm pad: three detuned band-limited saws per chord tone, low-passed, swelling in and out over each bar. */
function pad(t: Track, g: Grid, c: Ctx): void {
  const sr = t.sampleRate;
  const detunes = [0.9962, 1.0038];
  for (let bar = 0; bar < g.bars; bar++) {
    const rootDegree = c.root(bar, g.bars);
    const level = arc(bar, g.bars);
    const dur = g.barSeconds * 1.14; // overlaps into the next bar so chords melt into each other
    for (const offset of [0, 2, 4]) {
      const hz = c.d(c.degree(rootDegree + offset, 0));
      const phases = detunes.map((_, i) => i / 2);
      let lp1 = 0;
      let lp2 = 0;
      const k = onePole(950, sr);
      t.add(g.start(bar, 0), dur, (s) => {
        // A plain saw: the low-pass below leaves nothing audible of its aliasing at these pitches.
        let sum = 0;
        for (let i = 0; i < 2; i++) {
          phases[i] += (hz * detunes[i]) / sr;
          if (phases[i] >= 1) phases[i] -= 1;
          sum += 2 * phases[i] - 1;
        }
        lp1 += k * (sum - lp1);
        lp2 += k * (lp1 - lp2);
        const env = s > 0.6 && dur - s > 0.55 ? 1 : smooth(s / 0.6) * smooth((dur - s) / 0.55);
        return lp2 * env * 0.25 * level;
      });
    }
  }
}

/** Plucked lute arpeggio under the pad: eighth notes through the chord, accents on one and three. */
function lute(t: Track, g: Grid, c: Ctx): void {
  const feel = new Feel(g, c, 23);
  const swing = c.syn.swing ?? 0;
  const arpA = [0, 4, 7, 4, 2, 4, 7, 4];
  const arpB = [0, 2, 4, 7, 4, 2, 4, 2];
  const accent = [1, 0.55, 0.72, 0.55, 0.88, 0.55, 0.72, 0.55];
  for (let bar = 0; bar < g.bars; bar++) {
    const a = arc(bar, g.bars);
    const rootDegree = c.root(bar, g.bars);
    const arp = bar % 2 === 0 ? arpA : arpB;
    for (let i = 0; i < 8; i++) {
      // Off-beat eighths lag by a swing's worth of two steps.
      const lag = i % 2 === 1 ? swing * 2 * g.stepSamples : 0;
      const start = feel.at(bar, i * 2) + Math.round(lag);
      const hz = c.d(c.degree(rootDegree + arp[i], 1));
      const vel = accent[i] * (1 + 0.1 * feel.rnd()) * a;
      t.addBuffer(start, pluck(hz, t.sampleRate, 1.4, 0.5, 0.55, 1000 + bar * 8 + i), 0.55 * vel);
    }
  }
}

function vocal(t: Track, g: Grid, c: Ctx): void {
  if (c.syn.voices.vocal === 'throat-chant') {
    for (let bar = 0; bar < g.bars; bar++) {
      const aHalf = bar < g.bars / 2;
      chant(t, g, bar, c.d(c.degree((aHalf ? c.syn.vocalA : c.syn.vocalB)[bar % 4], -1)), arc(bar, g.bars));
    }
    return;
  }
  pad(t, g, c);
  lute(t, g, c);
}

// --- melody -----------------------------------------------------------------------------------

function melody(t: Track, g: Grid, c: Ctx): void {
  const sr = t.sampleRate;
  const beatSamples = g.barSamples / 4;
  const r = rng(31);
  const levels = rng(37);
  const place = (tune: readonly TuneNote[], startBar: number): void => {
    let cursor = startBar * g.barSamples;
    for (const [deg, beats] of tune) {
      const hz = c.d(c.degree(deg, 1));
      const seconds = (beats * beatSamples) / sr;
      const level = 0.85 + 0.15 * (levels() * 0.5 + 0.5);
      if (c.syn.voices.melody === 'trumpet') {
        const maxK = Math.max(1, Math.min(8, Math.floor((sr * 0.45) / hz)));
        const amp = Array.from({ length: maxK + 1 }, (_, k) => (k === 0 ? 0 : 1 / k ** 0.8));
        const soft = onePole(3200, sr);
        let lp = 0;
        t.add(Math.round(cursor), seconds * 0.97, (s) => {
          const env = Math.min(1, s / 0.03) * Math.min(1, (seconds - s) / 0.05 + 0.2) * Math.exp(-s * 0.3);
          // Lip trill: vibrato plus a quick flutter that wobbles both pitch and loudness.
          const flutter = Math.sin(TAU * 7 * s);
          const vib = 1 + 0.012 * Math.min(1, s / 0.15) * Math.sin(TAU * 5.5 * s) + 0.006 * flutter;
          const w = TAU * hz * vib * s;
          let sum = 0;
          const c2 = 2 * Math.cos(w);
          let prev = 0;
          let cur = Math.sin(w);
          for (let k = 1; k <= maxK; k++) {
            sum += cur * amp[k];
            const next = c2 * cur - prev;
            prev = cur;
            cur = next;
          }
          // Buzzy lip noise rides on the odd harmonics' phase, deterministic and noise-free.
          const buzz = Math.sin(w * 0.5 + 0.8 * Math.sin(w * 3)) * 0.15;
          lp += soft * (env * (1 + 0.15 * flutter) * (sum * 0.38 + buzz) * 0.5 - lp);
          return lp;
        });
        cursor += beats * beatSamples;
        continue;
      }
      // Flute: a mostly sine tone with a trace of the overtones, breath noise around the pitch, a
      // little chiff on the attack and a vibrato that arrives after the note has opened.
      const breath = new Biquad('bandpass', hz * 2.5, 1.2, sr);
      let phase = 0;
      t.add(Math.round(cursor), seconds * 0.94, (s) => {
        const vib = 0.004 * smooth((s - 0.25) / 0.4) * Math.sin(TAU * 5.2 * s);
        phase += (TAU * hz * (1 + vib)) / sr;
        const tone = Math.sin(phase) + 0.22 * Math.sin(2 * phase) + 0.07 * Math.sin(3 * phase);
        const air = breath.process(r()) * (0.35 + 0.8 * Math.exp(-s * 40));
        const env = smooth(s / 0.07) * smooth((seconds * 0.94 - s) / 0.09) * (0.9 + 0.1 * Math.exp(-s * 3));
        return (tone * 0.5 + air * 0.25) * env * level;
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
function chant(t: Track, g: Grid, bar: number, hz: number, level: number): void {
  // Formant centres (Hz) for "ha" (open a) and "la" (darker a), one syllable per beat.
  const vowels = [[700, 1150], [520, 1500]] as const;
  const maxFor = (f: number): number => Math.max(1, Math.min(14, Math.floor((t.sampleRate * 0.45) / f)));
  for (let q = 0; q < 4; q++) {
    const [f1, f2] = vowels[q % 2];
    const dur = g.stepSeconds * 3.6;
    // Harmonic weights depend only on the voice, not on time: computed once per syllable.
    const voices = [0.997, 1.004].map((detune) => {
      const f0 = hz * detune;
      const top = maxFor(f0);
      const weights: number[] = [0];
      for (let k = 1; k <= top; k++) {
        const fk = k * f0;
        const res = 1 / (1 + ((fk - f1) / 140) ** 2) + 0.7 / (1 + ((fk - f2) / 220) ** 2);
        weights.push((0.25 + 1.6 * res) / k);
      }
      return { f0, top, weights };
    });
    t.add(g.start(bar, q * 4), dur, (s) => {
      // Pulses on the beat: fast attack, quick decay to a sustained throat drone.
      const env = Math.min(1, s / 0.012) * (0.45 + 0.55 * Math.exp(-s * 9));
      let sum = 0;
      for (const v of voices) {
        // sin(k w) by the Chebyshev recurrence: one sin and one cos per voice instead of one per harmonic.
        const w = TAU * v.f0 * s;
        const c2 = 2 * Math.cos(w);
        let prev = 0;
        let cur = Math.sin(w);
        for (let k = 1; k <= v.top; k++) {
          sum += cur * v.weights[k];
          const next = c2 * cur - prev;
          prev = cur;
          cur = next;
        }
      }
      return env * sum * 0.22 * level;
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
export const STEM_PEAK: Readonly<Record<string, number>> = { kick: 0.4, snare: 0.34, hat: 0.27, bass: 0.38, vocal: 0.31, melody: 0.19, boss: 0.1 };

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
