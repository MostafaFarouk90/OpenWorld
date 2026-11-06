import { Biquad, TAU, onePole, rng, sawBlep, smooth, soften } from './dsp';
import { AH, OH, formantVoice, lowAdd, type Formant } from './act3Voices';
import type { Ctx, Feel, Grid, Track, arc, tokens } from './stemSynth';

// Act 4 stem voices (L8): "Dust Chant" (muffled, dry-slap, sand-hiss, drone-bass, throat-kh, overtone-whistle,
// walker-chant, hollow-gong) and the boss stem of the Harrowmark ash variant of "Seven Gates, One Drum"
// (engine-hammer). Same rules as the Act 1 to 3 voices: seeded noise only, notes wrap at the loop end, every stem is
// normalised by synthStem. This file takes only types from stemSynth.ts; the helpers it needs arrive through
// `createAct4Voices`, and the formant helpers are Act 3's.

export interface Act4Kit {
  tokens: typeof tokens;
  arc: typeof arc;
  Feel: typeof Feel;
}

export type Act4Voice = (t: Track, g: Grid, c: Ctx) => void;
export type Act4Voices = Readonly<Record<string, Act4Voice>>;

/** A dark "uh" between OH and AH, the throat drone's vowel. */
const UH: readonly Formant[] = [{ fc: 600, bw: 130, g: 1.5 }, { fc: 1000, bw: 180, g: 0.7 }];

/** Gong partials as [ratio, gain, decay per second]: a beating pair on the fundamental, then inharmonic overtones. */
export const GONG_PARTIALS: readonly (readonly [number, number, number])[] = [
  [1, 0.7, 0.55], [1.007, 0.45, 0.6], [2.76, 0.35, 1.1], [5.4, 0.18, 2], [8.93, 0.08, 3.4],
];

export function createAct4Voices(kit: Act4Kit): Act4Voices {
  const { tokens, arc, Feel } = kit;

  /** Calls `hit` for every pattern step holding one of `want`, with the stem's human feel applied. */
  function eachHit(g: Grid, c: Ctx, seed: number, want: readonly string[], hit: (start: number, vel: number, tok: string, step: number, bar: number) => void): void {
    const feel = new Feel(g, c, seed);
    for (let bar = 0; bar < g.bars; bar++) {
      const a = arc(bar, g.bars);
      tokens(c.syn.pattern[bar % 2]).forEach((tok, step) => {
        if (want.includes(tok)) hit(feel.at(bar, step), (step % 4 === 0 ? 1 : 0.8) * (1 + 0.06 * feel.rnd()) * a, tok, step, bar);
      });
      if (bar >= g.bars / 2 && want.includes('t')) {
        tokens(c.syn.bHatExtra[bar % 2]).forEach((tok, step) => {
          if (tok === 't') hit(feel.at(bar, step), 0.45 * a, 'ghost', step, bar);
        });
      }
    }
  }

  // --- Dust Chant -------------------------------------------------------------------------------

  /** Muffled kick: a soft, low pitch-drop thump with the click rolled off, as if struck through cloth. */
  const muffled: Act4Voice = (t, g, c) => {
    const sr = t.sampleRate;
    const r = rng(401);
    eachHit(g, c, 403, ['B'], (start, vel) => {
      let phase = 0;
      let lp = 0;
      const k = onePole(420, sr);
      const thud = new Biquad('lowpass', 260, 0.7, sr);
      t.add(start, 0.4, (s) => {
        phase += (TAU * (46 + 58 * Math.exp(-s * 28))) / sr;
        const body = Math.sin(phase) * Math.exp(-s * 8.5);
        const cloth = thud.process(r()) * Math.exp(-s * 45) * 0.5;
        lp += k * (body + cloth - lp);
        return soften(lp * 1.3 * vel, 1.2);
      });
    });
  };

  /** Dry slap: a short palm slap on hide, band noise and a small woody knock, no ringing tail. */
  const drySlap: Act4Voice = (t, g, c) => {
    const sr = t.sampleRate;
    const r = rng(411);
    eachHit(g, c, 413, ['K'], (start, vel) => {
      const bp = new Biquad('bandpass', 1300, 0.8, sr);
      let phase = 0;
      t.add(start, 0.09, (s) => {
        phase += (TAU * (240 - 50 * Math.min(1, s * 30))) / sr;
        const slap = bp.process(r()) * Math.exp(-s * 85) * 1.4;
        return (slap + Math.sin(phase) * Math.exp(-s * 70) * 0.45) * vel;
      });
    });
  };

  /** Sand hiss: high, grainy noise with a slow swell, like sand thrown across a skin; open hats drag longer. */
  const sandHiss: Act4Voice = (t, g, c) => {
    const sr = t.sampleRate;
    const r = rng(421);
    const grains = rng(423);
    eachHit(g, c, 425, ['t', 'ts'], (start, vel, tok) => {
      const open = tok === 'ts';
      const len = open ? 0.38 : 0.11;
      const hp = new Biquad('highpass', Math.min(5600, sr * 0.4), 0.7, sr);
      let grain = 1;
      t.add(start, len, (s, i) => {
        // A new grain level every couple of milliseconds gives the sand its texture.
        if (i % Math.max(1, Math.round(sr * 0.0025)) === 0) grain = 0.45 + 0.55 * Math.abs(grains());
        const env = smooth(s / (open ? 0.05 : 0.012)) * Math.exp(-s * (open ? 7 : 32));
        return hp.process(r()) * grain * env * 0.7 * vel;
      });
    });
  };

  /** Drone bass: one sustained saw per bar on the root with a slow breathing low-pass and a sub, bars melting into each other. */
  const droneBass: Act4Voice = (t, g, c) => {
    for (let bar = 0; bar < g.bars; bar++) {
      const a = arc(bar, g.bars);
      const hz = c.d(c.degree(c.root(bar, g.bars), -1));
      const len = g.barSeconds * 1.08;
      lowAdd(t, 4, g.start(bar, 0), len, (sr) => {
        const dt = hz / sr;
        let phase = 0;
        let l1 = 0;
        let l2 = 0;
        return (s) => {
          phase += dt;
          if (phase >= 1) phase -= 1;
          const breath = 0.5 + 0.5 * Math.sin((TAU * s) / g.barSeconds - Math.PI / 2);
          const k = onePole(150 + 170 * breath, sr);
          l1 += k * (sawBlep(phase, dt) - l1);
          l2 += k * (l1 - l2);
          const env = smooth(s / 0.18) * smooth((len - s) / 0.25);
          return (l2 * 0.9 + Math.sin(TAU * phase) * 0.6) * env * a * 0.6;
        };
      });
    }
  };

  /** Throat drone: a low "uh" with a whistling overtone that wanders, and a rasped "kh" exhale on steps 7 and 15. */
  const throatKh: Act4Voice = (t, g, c) => {
    const sr = t.sampleRate;
    const r = rng(431);
    for (let bar = 0; bar < g.bars; bar++) {
      const a = arc(bar, g.bars);
      const deg = (bar < g.bars / 2 ? c.syn.vocalA : c.syn.vocalB)[bar % 4];
      const hz = c.d(c.degree(deg, 0));
      for (const step of [0, 8]) {
        const len = g.stepSeconds * 6.6;
        lowAdd(t, 3, g.start(bar, step), len, (lr) => {
          const voice = formantVoice(lr, hz, [0.997, 1.003], UH, { tilt: 1.1, maxHz: 2400, maxK: 14 });
          // The overtone singer's whistle: a thin sine on the 6th, 8th or 9th partial, chosen per note.
          const partial = [6, 8, 9][(bar + step / 8) % 3];
          const wh = hz * partial;
          let wp = 0;
          return (s) => {
            const env = smooth(s / 0.12) * smooth((len - s) / 0.15);
            wp += (TAU * wh * (1 + 0.003 * Math.sin(TAU * 0.7 * s))) / lr;
            const whistle = wh < lr * 0.45 ? Math.sin(wp) * 0.05 * smooth((s - 0.2) / 0.5) : 0;
            return (voice(1 + 0.002 * Math.sin(TAU * 4.5 * s)) * 0.13 + whistle) * env * a;
          };
        });
      }
      // The "kh" exhale: band noise with a rasping buzz, a quick swell and a fall.
      for (const step of [7, 15]) {
        const bp = new Biquad('bandpass', Math.min(2600, sr * 0.4), 1.1, sr);
        t.add(g.start(bar, step), 0.16, (s) => {
          const rasp = 0.6 + 0.4 * Math.sin(TAU * 55 * s);
          const env = smooth(s / 0.015) * Math.exp(-s * 22);
          return bp.process(r()) * rasp * env * 0.9 * a;
        });
      }
    }
  };

  /** Low overtone whistle: a breathy sine with a sharp third partial and a slow vibrato that opens late. */
  const overtoneWhistle: Act4Voice = (t, g, c) => {
    const r = rng(441);
    const beat = g.barSamples / 4;
    const place = (tune: readonly (readonly [number, number])[], startBar: number): void => {
      let cursor = startBar * g.barSamples;
      for (const [deg, beats] of tune) {
        const hz = c.d(c.degree(deg, 1));
        const len = ((beats * beat) / t.sampleRate) * 0.93;
        const level = arc(Math.min(g.bars - 1, Math.floor(cursor / g.barSamples)), g.bars);
        lowAdd(t, 3, Math.round(cursor), len, (sr) => {
          const air = new Biquad('bandpass', Math.min(hz * 3, sr * 0.4), 1.4, sr);
          let phase = 0;
          return (s) => {
            const vib = 0.005 * smooth((s - 0.35) / 0.5) * Math.sin(TAU * 4.6 * s);
            phase += (TAU * hz * (1 + vib)) / sr;
            const tone = Math.sin(phase) + 0.18 * Math.sin(3 * phase);
            const env = smooth(s / 0.1) * smooth((len - s) / 0.14);
            return (tone * 0.5 + air.process(r()) * 0.2) * env * level;
          };
        });
        cursor += beats * beat;
      }
    };
    place(c.syn.tuneA, 0);
    place(c.syn.tuneB, g.bars / 2);
  };

  /**
   * Walker chant (Eormen's boss stem): five low voices in unison, one slow syllable every half bar gliding from "oh" to
   * "ah", over a muffled footfall on every beat: a procession.
   */
  const walkerChant: Act4Voice = (t, g, c) => {
    const sr = t.sampleRate;
    const r = rng(451);
    const detunes = [0.993, 0.997, 1, 1.003, 1.007];
    for (let bar = 0; bar < g.bars; bar++) {
      const a = arc(bar, g.bars);
      const deg = (bar < g.bars / 2 ? c.syn.vocalA : c.syn.vocalB)[bar % 4];
      for (const [step, d] of [[0, deg], [8, deg + (bar % 2 === 0 ? 0 : -1)]] as const) {
        const hz = c.d(c.degree(d, 0));
        const len = g.stepSeconds * 7.6;
        lowAdd(t, 4, g.start(bar, step), len, (lr) => {
          const oh = formantVoice(lr, hz, detunes, OH, { tilt: 1.15, maxHz: 1800, maxK: 10 });
          const ah = formantVoice(lr, hz, detunes, AH, { tilt: 1.15, maxHz: 1800, maxK: 10 });
          return (s) => {
            const glide = smooth(s / len);
            const env = smooth(s / 0.25) * smooth((len - s) / 0.3);
            return (oh(1) * (1 - glide) + ah(1) * glide) * 0.05 * env * a;
          };
        });
      }
      for (let q = 0; q < 4; q++) {
        const lp = new Biquad('lowpass', 180, 0.7, sr);
        t.add(g.start(bar, q * 4), 0.18, (s) => lp.process(r()) * Math.exp(-s * 26) * 0.9 * a);
      }
    }
  };

  /**
   * One hollow gong toll: inharmonic partials with a beating pair, a slight downward bend and a soft mallet. All of it
   * sits under 1.2 kHz, so it renders at a quarter of the rate (`lowAdd`).
   */
  function gongToll(t: Track, start: number, hz: number, seconds: number, vel: number, seed: number): void {
    lowAdd(t, 4, start, seconds, (sr) => {
      const r = rng(seed);
      const mallet = new Biquad('lowpass', Math.min(900, sr * 0.4), 0.7, sr);
      const parts = GONG_PARTIALS.filter(([ratio]) => hz * ratio < sr * 0.45);
      const phases = parts.map(() => 0);
      return (s) => {
        const bend = 1 - 0.006 * (1 - Math.exp(-s * 1.5));
        let sum = 0;
        for (let p = 0; p < parts.length; p++) {
          const [ratio, gain, decay] = parts[p];
          phases[p] += (TAU * hz * ratio * bend) / sr;
          sum += Math.sin(phases[p]) * gain * Math.exp(-s * decay);
        }
        const hum = 0.75 + 0.25 * Math.sin(TAU * 0.9 * s); // the slow swell of a big gong
        return (sum * hum * Math.min(1, s / 0.006) + mallet.process(r()) * Math.exp(-s * 60) * 0.4) * vel;
      };
    });
  }

  /** Hollow gong (Dust Chant's `toll` stem): one toll every two bars on beat one, ringing into the next. */
  const hollowGong: Act4Voice = (t, g, c) => {
    for (let bar = 0; bar < g.bars; bar += 2) gongToll(t, g.start(bar, 0), c.d(c.degree(0, 0)), g.barSeconds * 2.2, arc(bar, g.bars), 461 + bar);
  };

  // --- Seven Gates (ash) ------------------------------------------------------------------------

  /**
   * Engine hammer (the Bellows-Engine's boss stem): half-time hammer blows on ringing iron, a piston chuff on the off
   * beats and a steam-hiss burst every two bars.
   */
  const engineHammer: Act4Voice = (t, g, c) => {
    const sr = t.sampleRate;
    const r = rng(471);
    const iron = c.d(c.degree(0, 1));
    for (let bar = 0; bar < g.bars; bar++) {
      const a = arc(bar, g.bars);
      for (const step of [0, 8]) {
        const thump = new Biquad('lowpass', 300, 0.7, sr);
        t.add(g.start(bar, step), 0.5, (s) => {
          const ring =
            Math.sin(TAU * iron * s) * 0.45 * Math.exp(-s * 7) +
            Math.sin(TAU * iron * 2.76 * s) * 0.3 * Math.exp(-s * 11) +
            Math.sin(TAU * Math.min(iron * 5.4, sr * 0.44) * s) * 0.18 * Math.exp(-s * 16);
          return (ring + thump.process(r()) * Math.exp(-s * 30) * 1.1) * a;
        });
      }
      const chuffs = bar >= g.bars / 2 ? [4, 6, 12, 14] : [4, 12];
      for (const step of chuffs) {
        const bp = new Biquad('bandpass', 480, 1.2, sr);
        t.add(g.start(bar, step), 0.14, (s) => bp.process(r()) * smooth(s / 0.01) * Math.exp(-s * 28) * 0.9 * a);
      }
      if (bar % 2 === 1) {
        const hp = new Biquad('highpass', Math.min(3500, sr * 0.4), 0.7, sr);
        const len = g.stepSeconds * 4;
        t.add(g.start(bar, 12), len, (s) => hp.process(r()) * smooth(s / 0.04) * smooth((len - s) / 0.2) * 0.5 * a);
      }
    }
  };

  return {
    muffled, 'dry-slap': drySlap, 'sand-hiss': sandHiss, 'drone-bass': droneBass, 'throat-kh': throatKh,
    'overtone-whistle': overtoneWhistle, 'walker-chant': walkerChant, 'hollow-gong': hollowGong, 'engine-hammer': engineHammer,
  };
}
