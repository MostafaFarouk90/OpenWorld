import { Biquad, TAU, onePole, rng, sawBlep, smooth, soften } from './dsp';
import type { Ctx, Feel, Grid, Track, arc, tokens } from './stemSynth';

// Act 2 stem voices (A14): thigh-slap, lip-buzz, whistle-click and gallop-hey for "Ash on the Pasture";
// boxy, metal-rim, steam, dum, anvil-clang, cave-howl and pound-clang for "Hammers Below". Same rules as the
// Act 1 voices: seeded noise only, notes wrap at the loop end, every stem is normalised by synthStem.
// This file takes only types from stemSynth.ts; the helpers it needs arrive through `createAct2Voices`.

export interface Act2Kit {
  tokens: typeof tokens;
  arc: typeof arc;
  Feel: typeof Feel;
}

export type Act2Voice = (t: Track, g: Grid, c: Ctx) => void;
export type Act2Voices = Readonly<Record<string, Act2Voice>>;

/** Anvil and bell partials: inharmonic ratios, one decaying sine each. */
const BELL = [
  [1, 1],
  [2.76, 0.6],
  [5.4, 0.4],
  [8.93, 0.2],
] as const;

export function createAct2Voices(kit: Act2Kit): Act2Voices {
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

  // --- Ash on the Pasture -----------------------------------------------------------------------

  /** Hand slapped on a thigh: a flat palm burst and a dull body knock, no ring. */
  const thighSlap: Act2Voice = (t, g, c) => {
    const sr = t.sampleRate;
    const r = rng(111);
    const slap = (start: number, vel: number): void => {
      const bp = new Biquad('bandpass', 1100, 0.7, sr);
      const hp = new Biquad('highpass', 400, 0.7, sr);
      let phase = 0;
      t.add(start, 0.14, (s) => {
        phase += (TAU * (150 - 40 * Math.min(1, s * 30))) / sr;
        const palm = bp.process(hp.process(r())) * Math.exp(-s * 75) * 2.2;
        return (palm + Math.sin(phase) * Math.exp(-s * 48) * 0.5) * 0.7 * vel;
      });
    };
    eachHit(g, c, 7, 'K', (start, vel, step, bar, feel) => {
      slap(start, (0.92 + 0.08 * feel.rnd()) * vel);
      if (bar % 4 === 3 && step === 12) slap(feel.at(bar, 15), 0.3 * vel);
    });
  };

  /** Lip-buzz vocal: a bowed fiddle drone and fifth, and a rolled "rrr" chanter that answers on beats two to three. */
  const lipBuzz: Act2Voice = (t, g, c) => {
    const sr = t.sampleRate;
    for (let bar = 0; bar < g.bars; bar++) {
      const half = bar < g.bars / 2 ? c.syn.vocalA : c.syn.vocalB;
      const rootSemis = c.degree(half[bar % 4], -1);
      const level = arc(bar, g.bars);
      const dur = g.barSeconds * 1.08;
      // Fiddle: two detuned saws on the root and a quieter fifth above, bow swell in, slow vibrato.
      for (const [semis, amp] of [[rootSemis, 1], [rootSemis + 7, 0.55]] as const) {
        const hz = c.d(semis);
        const phases = [0, 0.37];
        let l1 = 0;
        let l2 = 0;
        const k = onePole(1500, sr);
        t.add(g.start(bar, 0), dur, (s) => {
          const vib = 1 + 0.006 * smooth(s / 0.5) * Math.sin(TAU * 5.4 * s);
          let sum = 0;
          for (let i = 0; i < 2; i++) {
            phases[i] = (phases[i] + (hz * vib * (i === 0 ? 0.998 : 1.003)) / sr) % 1;
            sum += 2 * phases[i] - 1;
          }
          l1 += k * (sum - l1);
          l2 += k * (l1 - l2);
          const env = smooth(s / 0.14) * smooth((dur - s) / 0.1);
          return l2 * env * 0.3 * amp * level;
        });
      }
      // Chanter: a square-ish reed an octave and a bit up, amplitude-rolled at about 24 Hz on steps 4 to 11.
      const hz = c.d(rootSemis + 12 + (bar % 2 === 0 ? 0 : 3));
      const len = g.stepSeconds * 7.5;
      let phase = 0;
      let lp = 0;
      const k = onePole(2600, sr);
      t.add(g.start(bar, 4), len, (s) => {
        phase = (phase + hz / sr) % 1;
        const reed = Math.tanh(3 * Math.sin(TAU * phase)) + 0.4 * Math.sin(TAU * phase * 3);
        const roll = 0.55 + 0.45 * Math.max(0, Math.sin(TAU * 24 * s));
        lp += k * (reed - lp);
        return lp * roll * smooth(s / 0.03) * smooth((len - s) / 0.05) * 0.55 * level;
      });
    }
  };

  /** Whistle with a tongue-click at the head of each phrase and each long note. */
  const whistleClick: Act2Voice = (t, g, c) => {
    const sr = t.sampleRate;
    const beatSamples = g.barSamples / 4;
    const r = rng(131);
    const place = (tune: readonly (readonly [number, number])[], startBar: number): void => {
      let cursor = startBar * g.barSamples;
      tune.forEach(([deg, beats], index) => {
        const hz = c.d(c.degree(deg, 1));
        const seconds = (beats * beatSamples) / sr;
        const start = Math.round(cursor);
        const breath = new Biquad('bandpass', hz * 3, 1.5, sr);
        // Each note follows the bar's place in the phrase arc, and the longer ones are pressed a little harder.
        const level = arc(Math.min(g.bars - 1, Math.floor(start / g.barSamples)), g.bars) * (beats >= 2 ? 1 : 0.8) * (index === 0 ? 1.1 : 1);
        let phase = 0;
        t.add(start, seconds * 0.93, (s) => {
          const vib = 0.005 * smooth((s - 0.2) / 0.4) * Math.sin(TAU * 5.8 * s);
          phase += (TAU * hz * (1 + vib)) / sr;
          const tone = Math.sin(phase) + 0.08 * Math.sin(2 * phase);
          const air = breath.process(r()) * (0.3 + 0.6 * Math.exp(-s * 30));
          const env = smooth(s / 0.05) * smooth((seconds * 0.93 - s) / 0.08);
          return (tone * 0.5 + air * 0.22) * env * level;
        });
        if (index === 0 || beats >= 4) {
          const click = new Biquad('bandpass', 1900, 2, sr);
          t.add(start, 0.03, (s) => click.process(r()) * Math.exp(-s * 260) * 2.6);
        }
        cursor += beats * beatSamples;
      });
    };
    place(c.syn.tuneA, 0);
    place(c.syn.tuneB, g.bars / 2);
  };

  /**
   * Redmane's gallop: three tongue-clops a beat in the pattern long-short-short (steps 0, 2 and 3 of every beat,
   * twelve a bar), the first of each beat lower and louder. A shouted "Hey!" lands at step 12 of every even bar.
   */
  const gallopHey: Act2Voice = (t, g, c) => {
    const sr = t.sampleRate;
    const r = rng(141);
    const feel = new Feel(g, c, 43);
    const clop = (start: number, hz: number, vel: number): void => {
      const bp = new Biquad('bandpass', hz * 3, 4, sr);
      let phase = 0;
      t.add(start, 0.09, (s) => {
        phase += (TAU * (hz + hz * 0.8 * Math.exp(-s * 70))) / sr;
        return (Math.sin(phase) * Math.exp(-s * 55) + bp.process(r()) * Math.exp(-s * 140) * 0.8) * vel;
      });
    };
    const hey = (start: number, hz: number, vel: number): void => {
      const f1 = new Biquad('bandpass', 650, 3, sr);
      const f2 = new Biquad('bandpass', 1750, 4, sr);
      let phase = 0;
      t.add(start, 0.3, (s) => {
        phase = (phase + (hz * (1.25 - 0.4 * Math.min(1, s * 4))) / sr) % 1;
        const src = 2 * phase - 1 + 0.2 * r();
        const env = smooth(s / 0.02) * smooth((0.3 - s) / 0.1);
        return (f1.process(src) * 1.4 + f2.process(src) * 0.9) * env * vel;
      });
    };
    for (let bar = 0; bar < g.bars; bar++) {
      const a = arc(bar, g.bars);
      for (let beat = 0; beat < 4; beat++) {
        clop(feel.at(bar, beat * 4), 210, 0.95 * a);
        clop(feel.at(bar, beat * 4 + 2), 300, 0.6 * a);
        clop(feel.at(bar, beat * 4 + 3), 300, 0.7 * a);
      }
      if (bar % 2 === 0) hey(feel.at(bar, 12), c.d(c.degree(0, 0)), 0.9 * a);
    }
  };

  // --- Hammers Below ----------------------------------------------------------------------------

  /** Deep, boxy kick: a short low thump with a mid "box" knock. */
  const boxy: Act2Voice = (t, g, c) => {
    const sr = t.sampleRate;
    const r = rng(151);
    eachHit(g, c, 3, 'B', (start, vel) => {
      const box = new Biquad('bandpass', 260, 3, sr);
      let phase = 0;
      t.add(start, 0.26, (s) => {
        phase += (TAU * (46 + 70 * Math.exp(-s * 40))) / sr;
        const body = Math.sin(phase) * Math.exp(-s * 13) + 0.3 * Math.sin(2 * phase) * Math.exp(-s * 30);
        const knock = box.process(r()) * Math.exp(-s * 90) * 0.9;
        return soften((body * 1.1 + knock) * vel, 1.6) * 0.9;
      });
    });
  };

  /** Metallic rimshot: a bright click over inharmonic ringing partials. */
  const metalRim: Act2Voice = (t, g, c) => {
    const sr = t.sampleRate;
    const r = rng(161);
    eachHit(g, c, 7, 'K', (start, vel) => {
      const hp = new Biquad('highpass', 3000, 0.8, sr);
      t.add(start, 0.22, (s) => {
        const click = hp.process(r()) * Math.exp(-s * 180);
        let ring = 0;
        for (const [ratio, amp] of BELL) ring += Math.sin(TAU * 520 * ratio * s) * amp * Math.exp(-s * (28 + 9 * ratio));
        return (click * 0.8 + ring * 0.5) * 0.7 * vel;
      });
    });
  };

  /** Steam hiss: soft-attack filtered noise, closed ticks short, open ones a long exhale. */
  const steam: Act2Voice = (t, g, c) => {
    const sr = t.sampleRate;
    const r = rng(171);
    const hiss = (start: number, open: boolean, vel: number): void => {
      const bp = new Biquad('bandpass', 6200, 0.6, sr);
      t.add(start, open ? 0.3 : 0.09, (s) => bp.process(r()) * Math.min(1, s / 0.006) * Math.exp(-s * (open ? 9 : 30)) * 0.9 * vel);
    };
    const feel = new Feel(g, c, 13);
    for (let bar = 0; bar < g.bars; bar++) {
      const a = arc(bar, g.bars);
      tokens(c.syn.pattern[bar % 2]).forEach((tok, step) => {
        const vel = (step % 4 === 0 ? 0.75 : step % 4 === 2 ? 0.95 : 0.5) * (1 + 0.1 * feel.rnd()) * a;
        if (tok === 't') hiss(feel.at(bar, step), false, vel);
        else if (tok === 'ts') hiss(feel.at(bar, step), true, vel);
      });
      if (bar >= g.bars / 2) {
        tokens(c.syn.bHatExtra[bar % 2]).forEach((tok, step) => {
          if (tok === 't') hiss(feel.at(bar, step), false, 0.45 * a);
        });
      }
    }
  };

  /** Low voiced "dum": a short closed-mouth note on the chord root, stepping to the fifth. */
  const dum: Act2Voice = (t, g, c) => {
    const sr = t.sampleRate;
    const feel = new Feel(g, c, 19);
    const note = (start: number, hz: number, seconds: number, vel: number): void => {
      let phase = 0;
      const dt = hz / sr;
      let lp = 0;
      let lp2 = 0;
      const k = onePole(340, sr);
      t.add(start, seconds, (s) => {
        phase = (phase + dt) % 1;
        const src = sawBlep(phase, dt) * 0.6 + Math.sin(TAU * phase) * 0.8;
        lp += k * (src - lp);
        lp2 += k * (lp - lp2);
        return lp2 * 1.6 * smooth(s / 0.012) * Math.exp(-s * 6.5) * vel;
      });
    };
    for (let bar = 0; bar < g.bars; bar++) {
      const a = arc(bar, g.bars);
      const root = c.degree(c.root(bar, g.bars), -1);
      const at = (step: number, semis: number, steps: number, vel: number): void => note(feel.at(bar, step), c.d(semis), g.stepSeconds * steps, vel * a);
      at(0, root, 5, 1);
      at(6, root + 7, 2, 0.6);
      at(8, root, 4, 0.9);
      if (bar % 2 === 1) at(12, root + 3, 3, 0.7);
    }
  };

  /** One anvil strike: inharmonic partials with a hammer tick. */
  const anvil = (t: Track, start: number, hz: number, vel: number, r: () => number): void => {
    t.add(start, 0.5, (s) => {
      let ring = 0;
      for (const [ratio, amp] of BELL) ring += Math.sin(TAU * hz * ratio * s) * amp * Math.exp(-s * (7 + 5 * ratio));
      return (ring * 0.6 + r() * Math.exp(-s * 300) * 0.5) * Math.min(1, s / 0.002) * vel;
    });
  };

  /** Tongue-clicks and spoken "clang" hits: anvil strikes on the downbeats, clicks between, a low "ahng" on odd bars. */
  const anvilClang: Act2Voice = (t, g, c) => {
    const sr = t.sampleRate;
    const r = rng(181);
    const feel = new Feel(g, c, 29);
    for (let bar = 0; bar < g.bars; bar++) {
      const a = arc(bar, g.bars);
      const half = bar < g.bars / 2 ? c.syn.vocalA : c.syn.vocalB;
      const hz = c.d(c.degree(half[bar % 4], 2));
      anvil(t, feel.at(bar, 0), hz, 0.9 * a, r);
      anvil(t, feel.at(bar, 8), hz, 0.65 * a, r);
      for (const step of [3, 11, 14]) {
        const click = new Biquad('bandpass', 2600, 3, sr);
        t.add(feel.at(bar, step), 0.03, (s) => click.process(r()) * Math.exp(-s * 280) * 0.8 * a);
      }
      if (bar % 2 === 1) {
        const f0 = c.d(c.degree(half[bar % 4], -1));
        const f1 = new Biquad('bandpass', 520, 4, sr);
        const f2 = new Biquad('bandpass', 1000, 5, sr);
        let phase = 0;
        t.add(g.start(bar, 4), g.stepSeconds * 4, (s) => {
          phase = (phase + f0 / sr) % 1;
          const src = 2 * phase - 1;
          return (f1.process(src) + f2.process(src) * 0.6) * smooth(s / 0.03) * smooth((g.stepSeconds * 4 - s) / 0.06) * 0.7 * a;
        });
      }
    }
  };

  /** Hollow cave howl: a vowel swept by two formants over a slow-vibrato saw, with a long release. */
  const caveHowl: Act2Voice = (t, g, c) => {
    const sr = t.sampleRate;
    const beatSamples = g.barSamples / 4;
    const place = (tune: readonly (readonly [number, number])[], startBar: number): void => {
      let cursor = startBar * g.barSamples;
      for (const [deg, beats] of tune) {
        const hz = c.d(c.degree(deg, 1));
        const seconds = (beats * beatSamples) / sr;
        const f1 = new Biquad('bandpass', 400, 5, sr);
        const f2 = new Biquad('bandpass', 900, 5, sr);
        let phase = 0;
        t.add(Math.round(cursor), seconds * 1.05, (s, n) => {
          if ((n & 63) === 0) {
            const open = smooth(s / (seconds * 0.6));
            f1.set('bandpass', 380 + 350 * open, 5, sr);
            f2.set('bandpass', 850 + 700 * open, 5, sr);
          }
          phase = (phase + (hz * (1 + 0.012 * smooth((s - 0.3) / 0.5) * Math.sin(TAU * 4.3 * s))) / sr) % 1;
          const src = 2 * phase - 1;
          const env = smooth(s / 0.12) * smooth((seconds * 1.05 - s) / (seconds * 0.5));
          return (f1.process(src) * 1.2 + f2.process(src) * 0.8) * env * 0.5;
        });
        cursor += beats * beatSamples;
      }
    };
    place(c.syn.tuneA, 0);
    place(c.syn.tuneB, g.bars / 2);
  };

  /**
   * The Slagmaw's stem: half-time pounds (steps 0 and 8; the second is dropped every fourth bar), a clang that
   * wanders (step 12, step 10 on every third bar), a double-time steam tick under them, and the roar: a
   * tanh-saturated chant double a third below the vocal. The roar lives here so the vocal stem stays clean.
   */
  const poundClang: Act2Voice = (t, g, c) => {
    const sr = t.sampleRate;
    const r = rng(191);
    const feel = new Feel(g, c, 47);
    for (let bar = 0; bar < g.bars; bar++) {
      const a = arc(bar, g.bars);
      const pound = (step: number, vel: number): void => {
        let phase = 0;
        t.add(feel.at(bar, step), 0.4, (s) => {
          phase += (TAU * (38 + 50 * Math.exp(-s * 28))) / sr;
          return (Math.sin(phase) * Math.exp(-s * 8) + r() * Math.exp(-s * 120) * 0.4) * vel * a;
        });
      };
      pound(0, 1);
      if (bar % 4 !== 3) pound(8, 0.85);
      anvil(t, feel.at(bar, bar % 3 === 1 ? 10 : 12), c.d(c.degree(0, 2)), 0.8 * a, r);
      for (let step = 0; step < 16; step += 2) {
        const hp = new Biquad('highpass', 5500, 0.7, sr);
        t.add(g.start(bar, step), 0.05, (s) => hp.process(r()) * Math.exp(-s * 70) * 0.3 * a);
      }
      // Roar: saturated saw through a throat formant, a third below the vocal's root, swelling over the bar.
      const half = bar < g.bars / 2 ? c.syn.vocalA : c.syn.vocalB;
      const hz = c.d(c.degree(half[bar % 4], -1) - 3);
      const f1 = new Biquad('bandpass', 700, 2, sr);
      let phase = 0;
      t.add(g.start(bar, 0), g.barSeconds * 0.97, (s) => {
        phase = (phase + hz / sr) % 1;
        const swell = Math.sin((Math.PI * s) / (g.barSeconds * 0.97)) ** 1.5;
        return Math.tanh(5 * f1.process(2 * phase - 1) + 1.5 * (2 * phase - 1)) * swell * 0.35 * a;
      });
    }
  };

  return {
    'thigh-slap': thighSlap,
    'lip-buzz': lipBuzz,
    'whistle-click': whistleClick,
    'gallop-hey': gallopHey,
    boxy,
    'metal-rim': metalRim,
    steam,
    dum,
    'anvil-clang': anvilClang,
    'cave-howl': caveHowl,
    'pound-clang': poundClang,
  };
}
