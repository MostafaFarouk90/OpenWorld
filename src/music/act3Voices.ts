import { Biquad, TAU, onePole, rng, sawBlep, smooth, soften } from './dsp';
import type { Ctx, Feel, Grid, Track, arc, tokens } from './stemSynth';

// Act 3 stem voices (K14): "Peat and Pitch" (wet, plip, bubble, peat-hum, bog-chant, reed-whistle, gurgle-chant) and
// "Wing over Rime" (airy, room-clap, tick, chest-bass, falsetto-choir, soar-whistle, harsh-chant, cathedral-chant).
// Same rules as the Act 1 and 2 voices: seeded noise only, notes wrap at the loop end, every stem is normalised by
// synthStem. This file takes only types from stemSynth.ts; the helpers it needs arrive through `createAct3Voices`.

export interface Act3Kit {
  tokens: typeof tokens;
  arc: typeof arc;
  Feel: typeof Feel;
}

export type Act3Voice = (t: Track, g: Grid, c: Ctx) => void;
export type Act3Voices = Readonly<Record<string, Act3Voice>>;

interface Formant {
  /** Centre Hz, bandwidth Hz and linear gain. */
  fc: number;
  bw: number;
  g: number;
}

/**
 * Additive voice through formant resonances: each detuned layer is a harmonic series weighted by the formants
 * (sin(k w) by the Chebyshev recurrence, one sin and one cos per layer per sample). Returns a per-sample function
 * taking the pitch factor (vibrato, glide); phases carry on from sample to sample.
 */
function formantVoice(sr: number, hz: number, detunes: readonly number[], formants: readonly Formant[], opts: { tilt?: number; maxHz?: number; maxK?: number; floor?: number } = {}): (pitch: number) => number {
  const { tilt = 1, maxHz = 4000, maxK = 24, floor = 0.1 } = opts;
  const layers = detunes.map((d, i) => {
    const f0 = hz * d;
    const top = Math.max(1, Math.min(maxK, Math.floor(Math.min(maxHz, sr * 0.45) / f0)));
    const w: number[] = [0];
    for (let k = 1; k <= top; k++) {
      let res = 0;
      for (const f of formants) res += f.g / (1 + ((k * f0 - f.fc) / f.bw) ** 2);
      w.push((floor + res) / k ** tilt);
    }
    return { f0, top, w, phase: ((i * 0.37) % 1) * TAU };
  });
  return (pitch) => {
    let sum = 0;
    for (const L of layers) {
      L.phase += (TAU * L.f0 * pitch) / sr;
      if (L.phase > TAU) L.phase -= TAU;
      const c2 = 2 * Math.cos(L.phase);
      let prev = 0;
      let cur = Math.sin(L.phase);
      for (let k = 1; k <= L.top; k++) {
        sum += cur * L.w[k];
        const next = c2 * cur - prev;
        prev = cur;
        cur = next;
      }
    }
    return sum;
  };
}

/** Schroeder hall: five damped combs and two all-passes. `dry` carries its own silent tail for the hall to ring into. */
function hall(dry: Float32Array, sr: number): Float32Array {
  const out = new Float32Array(dry.length);
  const combs = [0.0297, 0.0371, 0.0411, 0.0437, 0.0503].map((sec) => ({ buf: new Float32Array(Math.max(2, Math.round(sec * sr))), i: 0, lp: 0 }));
  const aps = [0.005, 0.0017].map((sec) => ({ buf: new Float32Array(Math.max(2, Math.round(sec * sr))), i: 0 }));
  for (let n = 0; n < dry.length; n++) {
    const x = dry[n];
    let sum = 0;
    for (const c of combs) {
      const y = c.buf[c.i];
      c.lp += 0.3 * (y - c.lp);
      c.buf[c.i] = x * 0.3 + c.lp * 0.9;
      c.i = c.i + 1 === c.buf.length ? 0 : c.i + 1;
      sum += y;
    }
    for (const a of aps) {
      const d = a.buf[a.i];
      const v = sum + 0.5 * d;
      a.buf[a.i] = v;
      a.i = a.i + 1 === a.buf.length ? 0 : a.i + 1;
      sum = d - 0.5 * v;
    }
    out[n] = sum * 0.4;
  }
  return out;
}

/** Catmull-Rom interpolation of a low-rate buffer up by `q` to `full` samples. */
function upsample(buf: Float32Array, q: number, full: number): Float32Array {
  const out = new Float32Array(full);
  const last = buf.length - 1;
  for (let i = 0; i < full; i++) {
    const p = i / q;
    const j = Math.floor(p);
    const f = p - j;
    const a = buf[j > 0 ? j - 1 : 0];
    const b = buf[j];
    const c = buf[Math.min(last, j + 1)];
    const d = buf[Math.min(last, j + 2)];
    out[i] = b + 0.5 * f * (c - a + f * (2 * a - 5 * b + 4 * c - d + f * (3 * (b - c) + d - a)));
  }
  return out;
}

/**
 * Like `Track.add`, but renders the note at `1/q` of the stem rate and interpolates up, for voices whose content sits
 * well below Nyquist (hums, whistles, chants). `make(rate)` builds the per-sample voice for the rate it renders at.
 * Low sample rates (the 8 kHz golden and test renders) skip the trick, as there is no headroom to give away.
 */
function lowAdd(t: Track, q0: number, start: number, seconds: number, make: (rate: number) => (s: number) => number): void {
  const sr = t.sampleRate;
  const q = sr >= 32000 ? q0 : 1;
  if (q === 1) {
    const fn = make(sr);
    t.add(start, seconds, (s) => fn(s));
    return;
  }
  const lr = sr / q;
  const full = Math.max(1, Math.round(seconds * sr));
  const buf = new Float32Array(Math.ceil(full / q) + 3);
  const fn = make(lr);
  for (let i = 0; i < buf.length; i++) buf[i] = fn(i / lr);
  t.addBuffer(start, upsample(buf, q, full), 1);
}

const AH: readonly Formant[] = [{ fc: 750, bw: 150, g: 1.4 }, { fc: 1150, bw: 200, g: 0.8 }];
const OO: readonly Formant[] = [{ fc: 320, bw: 90, g: 1.6 }, { fc: 880, bw: 150, g: 0.4 }];
const OH: readonly Formant[] = [{ fc: 500, bw: 110, g: 1.5 }, { fc: 900, bw: 160, g: 0.6 }];

export function createAct3Voices(kit: Act3Kit): Act3Voices {
  const { tokens, arc, Feel } = kit;

  /** Calls `hit` for every pattern step holding `token`, with the stem's human feel applied. */
  function eachHit(g: Grid, c: Ctx, seed: number, token: string, hit: (start: number, vel: number, step: number, bar: number, feel: InstanceType<typeof Feel>) => void): void {
    const feel = new Feel(g, c, seed);
    for (let bar = 0; bar < g.bars; bar++) {
      const a = arc(bar, g.bars);
      tokens(c.syn.pattern[bar % 2]).forEach((tok, step) => {
        if (tok === token) hit(feel.at(bar, step), (step % 4 === 0 ? 1 : 0.8) * (1 + 0.06 * feel.rnd()) * a, step, bar, feel);
      });
    }
  }

  /** Walks a tune (A in the first half, B in the second), calling `note` with its start sample, length and place in the phrase. */
  function eachNote(g: Grid, c: Ctx, note: (start: number, deg: number, beats: number, hz: number, level: number, index: number, prevDeg: number) => void): void {
    const beat = g.barSamples / 4;
    const place = (tune: readonly (readonly [number, number])[], startBar: number, before: number): void => {
      let cursor = startBar * g.barSamples;
      let prev = before;
      tune.forEach(([deg, beats], index) => {
        const start = Math.round(cursor);
        const level = arc(Math.min(g.bars - 1, Math.floor(start / g.barSamples)), g.bars) * (beats >= 2 ? 1 : 0.85);
        note(start, deg, beats, c.d(c.degree(deg, 1)), level, index, prev);
        prev = deg;
        cursor += beats * beat;
      });
    };
    const a = c.syn.tuneA;
    const b = c.syn.tuneB;
    place(a, 0, b[b.length - 1][0]);
    place(b, g.bars / 2, a[a.length - 1][0]);
  }

  // --- Peat and Pitch -----------------------------------------------------------------------------

  /** Soft wet kick: a low round thump and a short water "thup" (a falling chirp and band-passed noise), rounded by a low-pass. */
  const wet: Act3Voice = (t, g, c) => {
    const sr = t.sampleRate;
    const r = rng(211);
    eachHit(g, c, 3, 'B', (start, vel) => {
      const thup = new Biquad('bandpass', 380, 2.5, sr);
      const k = onePole(1500, sr);
      let lp = 0;
      let phase = 0;
      let chirp = 0;
      t.add(start, 0.3, (s) => {
        phase += (TAU * (46 + 70 * Math.exp(-s * 26))) / sr;
        chirp += (TAU * (320 - 220 * Math.min(1, s * 28))) / sr;
        const body = Math.sin(phase) * Math.exp(-s * 9);
        const water = (Math.sin(chirp) * 0.5 + thup.process(r()) * 0.7) * Math.exp(-s * 70) * 0.5;
        lp += k * ((body + water) * vel - lp);
        return soften(lp * 1.8, 1.3) * 0.85;
      });
    });
  };

  /** Finger flicked in water: a droplet that rings with a rising pitch, then a smaller echo droplet. */
  const plip: Act3Voice = (t, g, c) => {
    const sr = t.sampleRate;
    const r = rng(221);
    const feel = new Feel(g, c, 7);
    const drop = (start: number, vel: number, hz: number): void => {
      const ring = new Biquad('bandpass', hz, 9, sr);
      let phase = 0;
      t.add(start, 0.2, (s) => {
        phase += (TAU * (hz * 0.75 + hz * 0.4 * (1 - Math.exp(-s * 55)))) / sr;
        return (Math.sin(phase) * Math.exp(-s * 38) * 0.8 + ring.process(r()) * Math.exp(-s * 400) * 3) * vel * 0.8;
      });
    };
    for (let bar = 0; bar < g.bars; bar++) {
      const a = arc(bar, g.bars);
      const pattern = tokens(c.syn.pattern[bar % 2]);
      pattern.forEach((tok, step) => {
        if (tok !== 'K') return;
        const start = feel.at(bar, step);
        const vel = (0.92 + 0.08 * feel.rnd()) * a;
        drop(start, vel, 1200);
        drop(start + Math.round(0.045 * sr), vel * 0.3, 1550);
      });
      if (bar % 4 === 3 && pattern[15] !== 'K') drop(feel.at(bar, 15), 0.3 * a, 1100);
    }
  };

  /** Bubble pops: sine chirps rising from about 400 to 1200 Hz, a different size every time; open hats are a cluster. */
  const bubble: Act3Voice = (t, g, c) => {
    const sr = t.sampleRate;
    const r = rng(231);
    const feel = new Feel(g, c, 13);
    const pop = (start: number, vel: number): void => {
      const size = 0.8 + 0.45 * (r() * 0.5 + 0.5);
      const fizz = new Biquad('highpass', 5500, 0.7, sr);
      let phase = 0;
      t.add(start, 0.09, (s) => {
        phase += (TAU * size * (400 + 800 * (1 - Math.exp(-s * 110)))) / sr;
        return (Math.sin(phase) * Math.min(1, s / 0.002) * Math.exp(-s * 62) + fizz.process(r()) * Math.exp(-s * 220) * 0.15) * vel * 0.9;
      });
    };
    const accent = (step: number): number => (step % 4 === 0 ? 0.75 : step % 4 === 2 ? 0.95 : 0.5);
    for (let bar = 0; bar < g.bars; bar++) {
      const a = arc(bar, g.bars);
      tokens(c.syn.pattern[bar % 2]).forEach((tok, step) => {
        const start = feel.at(bar, step);
        const vel = accent(step) * (1 + 0.1 * feel.rnd()) * a;
        if (tok === 't') pop(start, vel);
        else if (tok === 'ts') {
          pop(start, vel);
          pop(start + Math.round(0.03 * sr), vel * 0.6);
          pop(start + Math.round(0.058 * sr), vel * 0.35);
        }
      });
      if (bar >= g.bars / 2) {
        tokens(c.syn.bHatExtra[bar % 2]).forEach((tok, step) => {
          if (tok === 't') pop(feel.at(bar, step), 0.45 * (1 + 0.1 * feel.rnd()) * a);
        });
      }
    }
  };

  /** Slow chest hum: a closed-mouth "mm" (sine, a touch of saw, a nasal band) on the chord roots, swelling in and out. */
  const peatHum: Act3Voice = (t, g, c) => {
    const feel = new Feel(g, c, 19);
    const note = (start: number, hz: number, seconds: number, vel: number): void =>
      lowAdd(t, 4, start, seconds, (sr) => {
        const dt = hz / sr;
        const k = onePole(420, sr);
        const nasal = new Biquad('bandpass', 270, 4, sr);
        let phase = 0;
        let lp = 0;
        let lp2 = 0;
        return (s) => {
          phase += dt * (1 + 0.003 * smooth((s - 0.3) / 0.5) * Math.sin(TAU * 4.6 * s));
          if (phase >= 1) phase -= 1;
          const src = sawBlep(phase, dt) * 0.5 + Math.sin(TAU * phase) * 0.9 + 0.3 * Math.sin(2 * TAU * phase);
          lp += k * (src - lp);
          lp2 += k * (lp - lp2);
          const env = smooth(s / 0.09) * smooth((seconds - s) / 0.2) * (0.85 + 0.15 * Math.exp(-s * 1.2));
          return (lp2 * 1.3 + nasal.process(src) * 0.5) * env * vel * 0.8;
        };
      });
    for (let bar = 0; bar < g.bars; bar++) {
      const a = arc(bar, g.bars);
      const root = c.degree(c.root(bar, g.bars), -1);
      const approach = c.degree(c.root((bar + 1) % g.bars, g.bars) - 1, -1);
      const at = (step: number, semis: number, steps: number, vel: number): void => note(feel.at(bar, step), c.d(semis), g.stepSeconds * steps, vel * a);
      if (bar % 4 === 3) {
        at(0, root, 8.2, 1);
        at(8, approach, 7.6, 0.8);
      } else {
        at(0, root, 11.5, 1);
        if (bar % 2 === 1) at(12, root + 7, 4, 0.6);
        else at(12, root + 12, 3.6, 0.45);
      }
    }
  };

  /** Bog chant: a low rolling hum with a falling glide on each note, breath, and scattered wet pops. */
  const bogChant: Act3Voice = (t, g, c) => {
    const sr = t.sampleRate;
    const r = rng(241);
    const pops = rng(243);
    for (let bar = 0; bar < g.bars; bar++) {
      const a = arc(bar, g.bars);
      const half = bar < g.bars / 2 ? c.syn.vocalA : c.syn.vocalB;
      const deg = half[bar % 4];
      [[0, deg, 1], [8, deg + (bar % 2 === 0 ? 2 : -1), 0.8]].forEach(([step, d, v]) => {
        const hz = c.d(c.degree(d, 0));
        const len = g.stepSeconds * 7.4;
        lowAdd(t, 4, g.start(bar, step), len, (lr) => {
          const voice = formantVoice(lr, hz, [0.996, 1.004], OH, { tilt: 1.2, maxHz: 1600, maxK: 9 });
          const breath = new Biquad('bandpass', 650, 1.4, lr);
          return (s) => {
            const env = smooth(s / 0.14) * smooth((len - s) / 0.2) * (0.8 + 0.2 * Math.sin(TAU * 1.3 * s));
            const roll = 1 + 0.045 * Math.exp(-s * 7) + 0.004 * smooth((s - 0.3) / 0.4) * Math.sin(TAU * 4.8 * s);
            return (voice(roll) * 0.16 + breath.process(r()) * 0.06) * env * a * v;
          };
        });
      });
      // Wet pops scattered through the bar (position and size from the seeded generator).
      for (let i = 0; i < 2; i++) {
        const step = Math.floor((pops() * 0.5 + 0.5) * 15.99);
        const size = 0.7 + 0.4 * (pops() * 0.5 + 0.5);
        let phase = 0;
        t.add(g.start(bar, step), 0.06, (s) => {
          phase += (TAU * size * (260 + 520 * (1 - Math.exp(-s * 90)))) / sr;
          return Math.sin(phase) * Math.exp(-s * 70) * 0.28 * a;
        });
      }
    }
  };

  /** Reed whistle: a thin pulse wave through a formant band, breath noise, vibrato that arrives after the note opens. */
  const reedWhistle: Act3Voice = (t, g, c) => {
    const r = rng(251);
    eachNote(g, c, (start, _deg, beats, hz, level) => {
      const seconds = (beats * g.barSamples) / 4 / t.sampleRate;
      const len = seconds * 0.93;
      lowAdd(t, 3, start, len, (sr) => {
        const dt = hz / sr;
        const body = new Biquad('bandpass', hz * 2.2, 3, sr);
        const nasal = new Biquad('bandpass', hz * 4.1, 4, sr);
        const air = new Biquad('bandpass', hz * 3, 1.5, sr);
        let phase = 0;
        return (s) => {
          const vib = 1 + 0.006 * smooth((s - 0.25) / 0.4) * Math.sin(TAU * 5.1 * s);
          phase = (phase + dt * vib) % 1;
          const pulse = sawBlep(phase, dt) - sawBlep((phase + 0.35) % 1, dt);
          const env = smooth(s / 0.05) * smooth((len - s) / 0.09) * (0.9 + 0.1 * Math.exp(-s * 3));
          return (body.process(pulse) * 0.5 + nasal.process(pulse) * 0.15 + Math.sin(TAU * phase) * 0.1 + air.process(r()) * (0.15 + 0.4 * Math.exp(-s * 25)) * 0.25) * env * level;
        };
      });
    });
  };

  /** Murkjaw: a sub-bass gurgle (wobbling pitch, burbling band of noise) under a slow, ominous "oh" chant. */
  const gurgleChant: Act3Voice = (t, g, c) => {
    const r = rng(261);
    for (let bar = 0; bar < g.bars; bar++) {
      const a = arc(bar, g.bars);
      const hz = c.d(c.degree(c.root(bar, g.bars), -2));
      const len = g.barSeconds * 0.98;
      lowAdd(t, 4, g.start(bar, 0), len, (sr) => {
        const burble = new Biquad('bandpass', 190, 3, sr);
        let phase = 0;
        return (s) => {
          phase += (TAU * hz * (1 + 0.05 * Math.sin(TAU * 7.3 * s) + 0.03 * Math.sin(TAU * 11.1 * s))) / sr;
          const swell = Math.sin((Math.PI * s) / len) ** 2;
          const pulse = Math.max(0, Math.sin(TAU * 4.2 * s)) ** 3;
          return (Math.sin(phase) * 0.8 + burble.process(r()) * pulse * 1.6) * swell * a * 0.8;
        };
      });
      if (bar % 2 === 0) {
        const chantHz = c.d(c.degree(c.root(bar, g.bars), -1) - 5);
        const clen = g.barSeconds * 1.98;
        lowAdd(t, 6, g.start(bar, 0), clen, (lr) => {
          const voice = formantVoice(lr, chantHz, [0.994, 1.006], OH, { tilt: 0.9, maxHz: 1300, maxK: 12 });
          return (s) => {
            const env = smooth(s / 0.5) * smooth((clen - s) / 0.6);
            return voice(1 + 0.004 * Math.sin(TAU * 4.4 * s) - 0.02 * Math.exp(-s * 3)) * 0.12 * env * a;
          };
        });
      }
    }
  };

  // --- Wing over Rime -----------------------------------------------------------------------------

  /** Crisp airy kick: a short sub with a bright beater click and little body. */
  const airy: Act3Voice = (t, g, c) => {
    const sr = t.sampleRate;
    const r = rng(271);
    eachHit(g, c, 3, 'B', (start, vel) => {
      const click = new Biquad('bandpass', 3200, 1, sr);
      let phase = 0;
      t.add(start, 0.2, (s) => {
        phase += (TAU * (44 + 110 * Math.exp(-s * 48))) / sr;
        const body = Math.sin(phase) * Math.exp(-s * 15);
        return soften((body * 1.1 + click.process(r()) * Math.exp(-s * 800) * 0.7) * vel, 1.4) * 0.9;
      });
    });
  };

  /** Hand clap in a stone room: three tight bursts and a longer band-passed tail. */
  const roomClap: Act3Voice = (t, g, c) => {
    const sr = t.sampleRate;
    const r = rng(281);
    const feel = new Feel(g, c, 7);
    const clap = (start: number, vel: number): void => {
      const hp = new Biquad('highpass', 800, 0.7, sr);
      const bp = new Biquad('bandpass', 1900, 0.9, sr);
      const room = new Biquad('bandpass', 1400, 0.7, sr);
      t.add(start, 0.42, (s) => {
        const bursts = Math.exp(-s * 200) + (s > 0.008 ? 0.8 * Math.exp(-(s - 0.008) * 200) : 0) + (s > 0.017 ? 0.7 * Math.exp(-(s - 0.017) * 190) : 0);
        const n = r();
        return (bp.process(hp.process(n)) * bursts * 1.5 + room.process(n) * Math.exp(-s * 11) * 0.35) * 0.7 * vel;
      });
    };
    for (let bar = 0; bar < g.bars; bar++) {
      const a = arc(bar, g.bars);
      const pattern = tokens(c.syn.pattern[bar % 2]);
      pattern.forEach((tok, step) => {
        if (tok === 'K') clap(feel.at(bar, step), (0.92 + 0.08 * feel.rnd()) * a);
      });
      if (bar % 4 === 3 && pattern[15] !== 'K') clap(feel.at(bar, 15), 0.35 * a);
    }
  };

  /** Fast bright ticks; in the B half an extra 32nd ghost follows some of them. */
  const tick: Act3Voice = (t, g, c) => {
    const sr = t.sampleRate;
    const r = rng(291);
    const feel = new Feel(g, c, 13);
    const hit = (start: number, open: boolean, vel: number): void => {
      const bp = new Biquad('bandpass', 7500, 1.2, sr);
      t.add(start, open ? 0.2 : 0.05, (s) => bp.process(r()) * Math.min(1, s / 0.0015) * Math.exp(-s * (open ? 18 : 130)) * 1.4 * vel);
    };
    const accent = (step: number): number => (step % 4 === 0 ? 0.75 : step % 4 === 2 ? 0.95 : 0.5);
    for (let bar = 0; bar < g.bars; bar++) {
      const a = arc(bar, g.bars);
      const bHalf = bar >= g.bars / 2;
      tokens(c.syn.pattern[bar % 2]).forEach((tok, step) => {
        const vel = accent(step) * (1 + 0.1 * feel.rnd()) * a;
        if (tok === 't') {
          hit(feel.at(bar, step), false, vel);
          if (bHalf && step % 2 === 0 && feel.rnd() > 0) hit(feel.at(bar, step) + Math.round(g.stepSamples * 0.5), false, 0.25 * a);
        } else if (tok === 'ts') hit(feel.at(bar, step), true, vel);
      });
      if (bHalf) {
        tokens(c.syn.bHatExtra[bar % 2]).forEach((tok, step) => {
          if (tok === 't') hit(feel.at(bar, step), false, 0.45 * (1 + 0.1 * feel.rnd()) * a);
        });
      }
    }
  };

  /** Driven chest bass: a saw and sub through a low-pass that snaps shut, with a chest attack and a little saturation. */
  const chestBass: Act3Voice = (t, g, c) => {
    const feel = new Feel(g, c, 19);
    const note = (start: number, hz: number, seconds: number, vel: number): void =>
      lowAdd(t, 3, start, seconds, (sr) => {
        const dt = hz / sr;
        const formant = new Biquad('bandpass', 420, 2, sr);
        const decay = Math.exp(-9 / sr);
        let phase = 0;
        let cut = 1;
        let lp = 0;
        let lp2 = 0;
        return (s) => {
          phase += dt;
          if (phase >= 1) phase -= 1;
          cut *= decay;
          const k = onePole(140 + 900 * cut, sr);
          const src = sawBlep(phase, dt) * 0.6;
          lp += k * (src - lp);
          lp2 += k * (lp - lp2);
          const thump = Math.sin(TAU * phase) * 0.75;
          const env = Math.min(1, s / 0.004) * Math.exp(-s * 2.6);
          return soften((lp2 * 1.5 + thump + formant.process(src) * 0.35 * Math.exp(-s * 25)) * env * vel * 1.2, 1.8) * 0.8;
        };
      });
    for (let bar = 0; bar < g.bars; bar++) {
      const a = arc(bar, g.bars);
      const root = c.degree(c.root(bar, g.bars), -1);
      const approach = c.degree(c.root((bar + 1) % g.bars, g.bars) - 1, -1);
      const at = (step: number, semis: number, steps: number, vel: number): void => note(feel.at(bar, step), c.d(semis), g.stepSeconds * steps, vel * a);
      at(0, root, 3, 1);
      at(3, root, 1.8, 0.6);
      at(6, root + 7, 2, 0.8);
      at(8, root, 3, 0.95);
      at(11, root + 12, 1.8, 0.6);
      if (bar % 4 === 3) at(14, approach, 1.8, 0.85);
      else at(14, root + 7, 1.8, 0.65);
    }
  };

  /** Falsetto choir: three detuned layers an octave up, breathy, alternating "ooh" and "ah", one held note a bar. */
  const falsettoChoir: Act3Voice = (t, g, c) => {
    const r = rng(301);
    for (let bar = 0; bar < g.bars; bar++) {
      const a = arc(bar, g.bars);
      const half = bar < g.bars / 2 ? c.syn.vocalA : c.syn.vocalB;
      const hz = c.d(c.degree(half[bar % 4], 1));
      const len = g.barSeconds * 1.12; // overlaps into the next bar so the notes melt together
      const sway = bar * 1.7;
      lowAdd(t, 4, g.start(bar, 0), len, (lr) => {
        const voice = formantVoice(lr, hz, [0.993, 1, 1.007], bar % 2 === 0 ? OO : AH, { tilt: 1.1, maxHz: 2500, maxK: 8 });
        const breath = new Biquad('bandpass', 2600, 1, lr);
        return (s) => {
          const env = smooth(s / 0.35) * smooth((len - s) / 0.5);
          const vib = 1 + 0.007 * smooth((s - 0.25) / 0.5) * Math.sin(TAU * 5.3 * s + sway);
          return (voice(vib) * 0.09 + breath.process(r()) * 0.04) * env * a;
        };
      });
    }
  };

  /** Soaring whistle: wide intervals joined by a slow portamento, a late deep vibrato, breath on the attack. */
  const soarWhistle: Act3Voice = (t, g, c) => {
    const r = rng(311);
    eachNote(g, c, (start, _deg, beats, hz, level, index, prevDeg) => {
      const seconds = (beats * g.barSamples) / 4 / t.sampleRate;
      const prevHz = c.d(c.degree(prevDeg, 1));
      const len = seconds * 0.97;
      lowAdd(t, 3, start, len, (sr) => {
        const air = new Biquad('bandpass', hz * 4, 2, sr);
        let phase = 0;
        return (s) => {
          const slide = (prevHz / hz) ** Math.exp(-s * 9);
          const vib = 1 + 0.009 * smooth((s - 0.35) / 0.6) * Math.sin(TAU * 5.5 * s);
          phase += (TAU * hz * slide * vib) / sr;
          const env = smooth(s / 0.07) * smooth((len - s) / 0.12) * (index === 0 ? 1.1 : 1);
          return (Math.sin(phase) + 0.12 * Math.sin(2 * phase) + air.process(r()) * (0.1 + 0.5 * Math.exp(-s * 30)) * 0.3) * env * level * 0.5;
        };
      });
    });
  };

  /** Skarl's chant: double-time driven syllables on the root and a roaring, saturated saw lead on the tune. */
  const harshChant: Act3Voice = (t, g, c) => {
    const feel = new Feel(g, c, 43);
    const ha: readonly Formant[] = [{ fc: 700, bw: 180, g: 1.5 }, { fc: 1200, bw: 250, g: 1 }];
    for (let bar = 0; bar < g.bars; bar++) {
      const a = arc(bar, g.bars);
      const hz = c.d(c.degree(c.root(bar, g.bars), -1));
      for (let step = 0; step < 16; step += 2) {
        const len = g.stepSeconds * 1.8;
        const vel = (step % 8 === 0 ? 1 : 0.75) * a;
        const f0 = hz * (step % 4 === 2 ? 1.5 : 1);
        lowAdd(t, 3, feel.at(bar, step), len, (lr) => {
          const voice = formantVoice(lr, f0, [0.997, 1.004], ha, { tilt: 0.7, maxHz: 2200, maxK: 12 });
          return (s) => {
            const env = Math.min(1, s / 0.006) * Math.exp(-s * 6) * smooth((len - s) / 0.02);
            return soften(voice(1 - 0.05 * Math.exp(-s * 25)) * 0.09 * env * vel, 1.2);
          };
        });
      }
    }
    eachNote(g, c, (start, _deg, beats, hz, level) => {
      const lo = hz * 0.5;
      const len = ((beats * g.barSamples) / 4 / t.sampleRate) * 0.96;
      lowAdd(t, 3, start, len, (sr) => {
        const dt = lo / sr;
        const k = onePole(1800, sr);
        let p1 = 0;
        let p2 = 0.3;
        let lp = 0;
        return (s) => {
          p1 = (p1 + dt) % 1;
          p2 = (p2 + dt * 1.006) % 1;
          const growl = 1 + 0.45 * Math.sin(TAU * 55 * s);
          lp += k * ((sawBlep(p1, dt) + sawBlep(p2, dt * 1.006)) * 0.5 - lp);
          return soften(lp * growl * 2.4, 1.5) * smooth(s / 0.03) * smooth((len - s) / 0.06) * level * 0.5;
        };
      });
    });
  };

  /**
   * Cathedral chant (the eighth stem, Ysmeryth's trial): four voices in long chords, two bars each, an "ah" choir
   * with a hall tail. Every chord starts a little before its bar (crossfading with the last) and rings on after it;
   * the first chord pre-rolls and the last rings past the loop end into the head, so a tiled loop has no seam. Four
   * distinct 4-bar phrases: the voicing of the top voice changes with each.
   */
  const cathedralChant: Act3Voice = (t, g, c) => {
    const sr = t.sampleRate;
    // The chord and its hall are rendered at a sixth of the rate (all the content is under 2 kHz) and
    // interpolated up, which keeps this stem's synth time in line with the others.
    const q = sr >= 32000 ? 6 : 1;
    const lr = sr / q;
    const lead = 0.7;
    const attack = 1.4;
    const release = 1.5;
    const tail = 3.2;
    const hold = g.barSeconds * 2;
    const dryLen = Math.round((lead + hold + release) * lr);
    const total = dryLen + Math.round(tail * lr);
    // Chord roots (scale degrees) and the top voice's offset for each of the four phrases (two chords each).
    const roots = [[0, 1], [5, 4], [2, 1], [1, 4]];
    const tops = [9, 11, 8, 9];
    for (let chord = 0; chord < g.bars / 2; chord++) {
      const phrase = Math.floor(chord / 2);
      const root = roots[phrase][chord % 2];
      const a = arc(chord * 2, g.bars);
      const opts = (maxK: number, tilt = 1) => ({ tilt, maxHz: 1800, maxK });
      const voices = [
        formantVoice(lr, c.d(c.degree(root, 0)), [1], AH, opts(14)),
        formantVoice(lr, c.d(c.degree(root + 4, 0)), [0.997, 1.003], AH, opts(10)),
        formantVoice(lr, c.d(c.degree(root + 7, 0)), [0.996, 1.004], OO, opts(8)),
        formantVoice(lr, c.d(c.degree(root + tops[phrase], 0)), [0.995, 1.005], OO, opts(6, 1.1)),
      ];
      const gains = [0.9, 0.8, 0.7, 0.5];
      const dry = new Float32Array(total);
      for (let i = 0; i < dryLen; i++) {
        const s = i / lr;
        const env = smooth(s / attack) * smooth((lead + hold + release - s) / release);
        const sway = 1 + 0.004 * smooth((s - 0.5) / 0.8) * Math.sin(TAU * 4.6 * s);
        let sum = 0;
        for (let v = 0; v < voices.length; v++) sum += voices[v](sway * (1 + 0.0015 * v * Math.sin(TAU * 0.31 * s + v))) * gains[v];
        dry[i] = sum * env * 0.06 * a;
      }
      const wetSig = hall(dry, lr);
      for (let i = 0; i < total; i++) dry[i] += wetSig[i] * 0.9;
      const full = q === 1 ? dry : upsample(dry, q, (total - 1) * q + 1);
      t.addBuffer(g.start(chord * 2, 0) - Math.round(lead * sr), full, 1);
    }
  };

  return {
    wet, plip, bubble, 'peat-hum': peatHum, 'bog-chant': bogChant, 'reed-whistle': reedWhistle, 'gurgle-chant': gurgleChant,
    airy, 'room-clap': roomClap, tick, 'chest-bass': chestBass, 'falsetto-choir': falsettoChoir, 'soar-whistle': soarWhistle, 'harsh-chant': harshChant, 'cathedral-chant': cathedralChant,
  };
}
