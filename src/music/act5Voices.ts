import { Biquad, TAU, onePole, pluck, rng, sawBlep, smooth, soften } from './dsp';
import { createAct2Voices } from './act2Voices';
import { AH, OH, createAct3Voices, formantVoice, lowAdd, type Formant } from './act3Voices';
import { createAct4Voices } from './act4Voices';
import type { Ctx, Feel, Grid, Track, arc, tokens } from './stemSynth';

// Act 5 stem voices (N8): "Heart of the Anvil" (anvil-kick, stomp-clap, steam-hiss, anvil-bass, crew-chant,
// rising-choir, bitter-lead, medley, heartbeat), the two ending themes (crew-hoh, anvil-strike) and the credits ballad
// (ballad-voice, ballad-pluck, refrain-crew and the four verse stems). Same rules as the Act 1 to 4 voices: seeded noise
// only, notes wrap at the loop end, every stem is normalised by synthStem. This file takes only types from stemSynth.ts;
// the helpers it needs arrive through `createAct5Voices`. The medley quotes the earlier areas' vocal textures by calling
// their shipped voice functions on a short grid in the Caldera's key: it is rendered here, never layered from a track.

export interface Act5Kit {
  tokens: typeof tokens;
  arc: typeof arc;
  Feel: typeof Feel;
  /** The Track class (the medley renders its textures into scratch tracks). */
  Track: new (length: number, sampleRate: number) => Track;
  /** The Act 1 vocal stem renderer (`hum` is the pad and lute, `throat-chant` the unison chant). */
  coreVocal: (t: Track, g: Grid, c: Ctx) => void;
}

export type Act5Voice = (t: Track, g: Grid, c: Ctx) => void;
export type Act5Voices = Readonly<Record<string, Act5Voice>>;

/** A short, open "eh" for the shouted "hey" of the crew. */
const EH: readonly Formant[] = [{ fc: 560, bw: 120, g: 1.5 }, { fc: 1750, bw: 220, g: 0.9 }];

/** The seven areas the medley quotes, in play order, and the voice each one lends (a name in the Act 1 to 4 tables). */
export const MEDLEY_TEXTURES: readonly { area: string; voice: string; core?: 'hum' | 'throat-chant' }[] = [
  { area: 'brightwater', voice: 'hum', core: 'hum' },
  { area: 'harrowmark', voice: 'throat-chant', core: 'throat-chant' },
  { area: 'cinderreach', voice: 'lip-buzz' },
  { area: 'oldsmoke', voice: 'anvil-clang' },
  { area: 'greyfen', voice: 'bog-chant' },
  { area: 'dragonspine', voice: 'falsetto-choir' },
  { area: 'ashen-waste', voice: 'throat-kh' },
];

export function createAct5Voices(kit: Act5Kit): Act5Voices {
  const { tokens, arc, Feel } = kit;
  const act2 = createAct2Voices({ tokens, arc, Feel });
  const act3 = createAct3Voices({ tokens, arc, Feel });
  const act4 = createAct4Voices({ tokens, arc, Feel });

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

  // --- the Caldera's kit ------------------------------------------------------------------------

  /** Big kick: a deep pitch drop with a long round body and a chest click; the biggest drum of the game. */
  const anvilKick: Act5Voice = (t, g, c) => {
    const sr = t.sampleRate;
    const r = rng(501);
    eachHit(g, c, 503, ['B'], (start, vel) => {
      let phase = 0;
      const click = new Biquad('bandpass', 1500, 1, sr);
      t.add(start, 0.5, (s) => {
        phase += (TAU * (38 + 110 * Math.exp(-s * 26))) / sr;
        const body = Math.sin(phase) * Math.exp(-s * 6.5) + 0.3 * Math.sin(2 * phase) * Math.exp(-s * 16);
        return soften((body * 1.25 + click.process(r()) * Math.exp(-s * 500) * 0.4) * vel, 1.6) * 0.95;
      });
    });
  };

  /** Stomp and clap together: a boxy boot thump under three staggered hand-claps. */
  const stompClap: Act5Voice = (t, g, c) => {
    const sr = t.sampleRate;
    const r = rng(511);
    eachHit(g, c, 513, ['K'], (start, vel) => {
      const bp = new Biquad('bandpass', 1500, 0.9, sr);
      let phase = 0;
      t.add(start, 0.22, (s) => {
        phase += (TAU * (62 + 60 * Math.exp(-s * 35))) / sr;
        const stomp = Math.sin(phase) * Math.exp(-s * 20) * 0.9;
        let clap = 0;
        for (const at of [0, 0.007, 0.016]) if (s >= at) clap += bp.process(r()) * Math.exp(-(s - at) * 55) * 0.55;
        return (stomp + clap) * vel;
      });
    });
  };

  /** Steam hiss: smooth high noise with a swell and a gated release; open hats breathe longer. */
  const steamHiss: Act5Voice = (t, g, c) => {
    const sr = t.sampleRate;
    const r = rng(521);
    eachHit(g, c, 523, ['t', 'ts'], (start, vel, tok) => {
      const open = tok === 'ts';
      const len = open ? 0.42 : 0.13;
      const hp = new Biquad('highpass', Math.min(4200, sr * 0.4), 0.7, sr);
      t.add(start, len, (s) => hp.process(r()) * smooth(s / (open ? 0.06 : 0.015)) * Math.exp(-s * (open ? 6 : 24)) * 0.7 * vel);
    });
  };

  /** Full chest-voice bass: an "oh" through formants on the root, a fifth and an octave, with a sub under it. */
  const anvilBass: Act5Voice = (t, g, c) => {
    const feel = new Feel(g, c, 531);
    for (let bar = 0; bar < g.bars; bar++) {
      const a = arc(bar, g.bars);
      const root = c.degree(c.root(bar, g.bars), -1);
      const note = (step: number, semis: number, steps: number, vel: number): void => {
        const hz = c.d(semis);
        const len = g.stepSeconds * steps;
        lowAdd(t, 4, feel.at(bar, step), len, (lr) => {
          const voice = formantVoice(lr, hz, [0.998, 1.002], OH, { tilt: 1.05, maxHz: 1500, maxK: 12 });
          let ph = 0;
          return (s) => {
            ph += (TAU * hz) / lr;
            const env = smooth(s / 0.02) * smooth((len - s) / 0.06);
            const throat = 1 + 0.08 * Math.sin(TAU * 5 * s);
            return (voice(throat) * 0.5 + Math.sin(ph) * 0.55) * env * vel * a;
          };
        });
      };
      note(0, root, 6.4, 1);
      note(6, root + 7, 2.2, 0.65);
      note(8, root, 4.4, 0.9);
      if (bar % 4 === 3) note(12, c.degree(c.root((bar + 1) % g.bars, g.bars) - 1, -1), 3.2, 0.85);
      else note(12, root + 12, 3, 0.55);
    }
  };

  /** One stomp: a short low thump of filtered noise and a falling sine. */
  function stomp(t: Track, start: number, vel: number, r: () => number): void {
    const lp = new Biquad('lowpass', 220, 0.7, t.sampleRate);
    let ph = 0;
    t.add(start, 0.14, (s) => {
      ph += (TAU * (80 - 30 * Math.min(1, s * 18))) / t.sampleRate;
      return (lp.process(r()) * 0.9 + Math.sin(ph) * 0.6) * Math.exp(-s * 30) * vel;
    });
  }

  /** The crew's "HEY, HEY, HOH": five detuned men, two shouted "hey" and a long falling "hoh" each bar, stomping on the beats. */
  const crewChant: Act5Voice = (t, g, c) => {
    const r = rng(541);
    const detunes = [0.992, 0.997, 1, 1.004, 1.009];
    for (let bar = 0; bar < g.bars; bar++) {
      const a = arc(bar, g.bars);
      const deg = (bar < g.bars / 2 ? c.syn.vocalA : c.syn.vocalB)[bar % 4];
      const syll = (step: number, d: number, steps: number, fm: readonly Formant[], vel: number, seed: number): void => {
        const hz = c.d(c.degree(d, 0));
        const len = g.stepSeconds * steps;
        lowAdd(t, 3, g.start(bar, step), len, (lr) => {
          const voice = formantVoice(lr, hz, detunes, fm, { tilt: 1.1, maxHz: 2600, maxK: 16 });
          const rr = rng(seed);
          return (s) => {
            // A shout: sharp attack, and the pitch falls through the syllable.
            const env = smooth(s / 0.012) * smooth((len - s) / 0.05);
            const fall = 1 - 0.07 * smooth(s / len) + 0.0015 * rr();
            return voice(fall) * 0.11 * env * vel * a;
          };
        });
      };
      syll(0, deg, 2.6, EH, 1, 541 + bar);
      syll(4, deg, 2.6, EH, 0.9, 561 + bar);
      syll(8, deg - 2, 6.6, OH, 1, 581 + bar);
      for (const step of [0, 4, 8, 12]) stomp(t, g.start(bar, step), (step === 0 ? 0.6 : 0.4) * a, r);
    }
  };

  /** Rising choir: three voices on an "ah" glide carrying the tune an octave up; each phrase's last note leans into the next. */
  const risingChoir: Act5Voice = (t, g, c) => {
    const beat = g.barSamples / 4;
    const place = (tune: readonly (readonly [number, number])[], startBar: number): void => {
      let cursor = startBar * g.barSamples;
      tune.forEach(([deg, beats], i) => {
        const hz = c.d(c.degree(deg, 1));
        const len = ((beats * beat) / t.sampleRate) * 0.95;
        const level = arc(Math.min(g.bars - 1, Math.floor(cursor / g.barSamples)), g.bars);
        const last = i === tune.length - 1;
        lowAdd(t, 4, Math.round(cursor), len, (lr) => {
          const voice = formantVoice(lr, hz, [0.996, 1, 1.004], AH, { tilt: 1.15, maxHz: 2200, maxK: 12 });
          return (s) => {
            const vib = 0.004 * smooth((s - 0.3) / 0.5) * Math.sin(TAU * 5 * s);
            const lean = last ? 1 + 0.02 * smooth((s - len * 0.6) / (len * 0.4)) : 1;
            const env = smooth(s / 0.09) * smooth((len - s) / 0.12);
            return voice((1 + vib) * lean) * 0.12 * env * level;
          };
        });
        cursor += beats * beat;
      });
    };
    place(c.syn.tuneA, 0);
    place(c.syn.tuneB, g.bars / 2);
  };

  /** Semitones above the tonic and lengths in steps of Vey's bitter line (flat second, flat sixth and a tritone). */
  const BITTER_A: readonly (readonly [number, number])[][] = [
    [[12, 4], [13, 4], [12, 4], [10, 2], [9, 2]],
    [[10, 4], [9, 4], [8, 4], [7, 2], [8, 2]],
  ];
  const BITTER_B: readonly (readonly [number, number])[][] = [
    [[15, 4], [14, 4], [12, 4], [13, 4]],
    [[12, 6], [10, 2], [9, 4], [6, 4]],
  ];

  /** Vey's stem: a narrow reedy lead that sags flat at each note's end, over a dry double-time snare roll on the off beats. */
  const bitterLead: Act5Voice = (t, g, c) => {
    const sr = t.sampleRate;
    const r = rng(551);
    for (let bar = 0; bar < g.bars; bar++) {
      const a = arc(bar, g.bars);
      const line = (bar < g.bars / 2 ? BITTER_A : BITTER_B)[bar % 2];
      let step = 0;
      for (const [semis, steps] of line) {
        const hz = c.d(semis);
        const len = g.stepSeconds * steps * 0.94;
        const dt = hz / sr;
        let phase = 0;
        let l1 = 0;
        const bp = new Biquad('bandpass', Math.min(hz * 3, sr * 0.4), 1.6, sr);
        t.add(g.start(bar, step), len, (s) => {
          const sag = 1 - 0.035 * smooth((s - len * 0.6) / (len * 0.4));
          const vib = 1 + 0.004 * smooth((s - 0.2) / 0.3) * Math.sin(TAU * 5.4 * s);
          phase += dt * sag * vib;
          if (phase >= 1) phase -= 1;
          l1 += onePole(2400, sr) * (sawBlep(phase, dt) - l1);
          const env = smooth(s / 0.03) * smooth((len - s) / 0.05);
          return (bp.process(l1) * 0.9 + l1 * 0.25) * env * 0.5 * a;
        });
        step += steps;
      }
      // The double-time roll: sixteenths on steps 4 to 7 and 12 to 15, swelling to the snare beat.
      const roll = new Biquad('bandpass', 1900, 1.1, sr);
      for (const base of [4, 12]) {
        for (let k = 0; k < 4; k++) {
          const vel = 0.35 + 0.18 * k;
          t.add(g.start(bar, base + k), 0.05, (s) => roll.process(r()) * Math.exp(-s * 70) * vel * a);
        }
      }
    }
  };

  /** Heartbeat: a low "lub-dub" twice a bar, the Anvil's own pulse (Ulthred's last phase). */
  const heartbeat: Act5Voice = (t, g) => {
    for (let bar = 0; bar < g.bars; bar++) {
      const a = arc(bar, g.bars);
      for (const [step, vel, hz] of [[0, 1, 46], [3, 0.7, 40], [8, 1, 46], [11, 0.7, 40]] as const) {
        let ph = 0;
        t.add(g.start(bar, step), 0.45, (s) => {
          ph += (TAU * (hz + 40 * Math.exp(-s * 40))) / t.sampleRate;
          return Math.sin(ph) * Math.exp(-s * 8) * vel * a * smooth(s / 0.004);
        });
      }
    }
  };

  // --- the medley -------------------------------------------------------------------------------

  /**
   * The medley (Ulthred's phase 2): two bars of each area's vocal texture in turn, sung on the Caldera's scale, then two
   * bars of all seven at once on the tonic. Each texture is rendered on its own two-bar scratch grid (A bar, B bar of
   * this track's chords) through the shipped voice function and copied in with a short fade, so no other track's loop is used.
   */
  const medley: Act5Voice = (t, g, c) => {
    const sr = t.sampleRate;
    const winBars = 2;
    const sections = g.bars / winBars;
    const barSamples = g.barSamples;
    const winLen = Math.round(barSamples * winBars);
    const grid2: Grid = {
      ...g,
      bars: winBars,
      start: (bar, step) => Math.round(bar * barSamples + step * g.stepSamples),
    };
    const tutti = new Float32Array(winLen);
    const fade = Math.max(1, Math.round(0.012 * sr));
    const sectionOf = (i: number): { voice: Act5Voice; core?: string } => {
      const tex = MEDLEY_TEXTURES[i];
      const named = (act2 as Record<string, Act5Voice | undefined>)[tex.voice] ?? (act3 as Record<string, Act5Voice | undefined>)[tex.voice] ?? (act4 as Record<string, Act5Voice | undefined>)[tex.voice];
      return { voice: named ?? ((tt, gg, cc) => kit.coreVocal(tt, gg, cc)), core: tex.core };
    };
    for (let i = 0; i < MEDLEY_TEXTURES.length; i++) {
      const scratch = new kit.Track(winLen, sr);
      const { voice, core } = sectionOf(i);
      const sc: Ctx = core
        ? { ...c, syn: { ...c.syn, voices: { ...c.syn.voices, vocal: core === 'throat-chant' ? 'throat-chant' : 'hum' } } }
        : { ...c, syn: { ...c.syn, voices: { ...c.syn.voices, vocal: 'crew-chant' } } };
      voice(scratch, grid2, sc);
      const tex = scratch.finish(0.3);
      // Section i occupies bars 2i and 2i+1 of the 16; the last window (bars 14 and 15) is the tutti below.
      if (i < sections - 1) {
        const at = i * winLen;
        for (let k = 0; k < winLen; k++) {
          const e = Math.min(1, k / fade, (winLen - 1 - k) / fade);
          t.data[(at + k) % t.length] += tex[k] * e;
        }
      }
      for (let k = 0; k < winLen; k++) tutti[k] += tex[k] / Math.sqrt(MEDLEY_TEXTURES.length);
    }
    const at = (sections - 1) * winLen;
    for (let k = 0; k < winLen; k++) {
      const e = Math.min(1, k / fade, (winLen - 1 - k) / fade);
      t.data[(at + k) % t.length] += tutti[k] * e * 1.2;
    }
  };

  // --- the ending themes ------------------------------------------------------------------------

  /** A low "hoh" bed: a few men humming one long note a bar. */
  const crewHoh: Act5Voice = (t, g, c) => {
    for (let bar = 0; bar < g.bars; bar++) {
      const a = arc(bar, g.bars);
      const deg = (bar < g.bars / 2 ? c.syn.vocalA : c.syn.vocalB)[bar % 4];
      const hz = c.d(c.degree(deg, -1));
      const len = g.barSeconds * 0.98;
      lowAdd(t, 4, g.start(bar, 0), len, (lr) => {
        const v = formantVoice(lr, hz, [0.994, 1, 1.006], OH, { tilt: 1.1, maxHz: 1400, maxK: 10 });
        return (s) => v(1) * 0.12 * smooth(s / 0.25) * smooth((len - s) / 0.3) * a;
      });
    }
  };

  /** A single soft strike of the Anvil on each marked step: the kick's pattern gives it a hit every two bars. */
  const anvilStrike: Act5Voice = (t, g, c) => {
    const hz = c.d(c.degree(0, 0));
    eachHit(g, c, 571, ['B'], (start, vel) => {
      t.add(start, 2.4, (s) => {
        let sum = 0;
        for (const [ratio, gain, decay] of [[1, 0.8, 1.3], [1.004, 0.5, 1.5], [2.76, 0.3, 2.4], [5.4, 0.12, 4]] as const) sum += Math.sin(TAU * hz * ratio * s) * gain * Math.exp(-s * decay);
        return sum * smooth(s / 0.004) * vel * 0.8;
      });
    });
  };

  // --- the credits ballad ------------------------------------------------------------------------

  /** Tobb: one plain voice singing the ballad's tune, "oh" to "ah", with a little breath. */
  const balladVoice: Act5Voice = (t, g, c) => {
    const beat = g.barSamples / 4;
    const place = (tune: readonly (readonly [number, number])[], startBar: number): void => {
      let cursor = startBar * g.barSamples;
      for (const [deg, beats] of tune) {
        const hz = c.d(c.degree(deg, 0));
        const len = ((beats * beat) / t.sampleRate) * 0.93;
        const level = arc(Math.min(g.bars - 1, Math.floor(cursor / g.barSamples)), g.bars);
        lowAdd(t, 4, Math.round(cursor), len, (lr) => {
          const oh = formantVoice(lr, hz, [1], OH, { tilt: 1.2, maxHz: 2000, maxK: 12 });
          const ah = formantVoice(lr, hz, [1], AH, { tilt: 1.2, maxHz: 2000, maxK: 12 });
          return (s) => {
            const vib = 1 + 0.006 * smooth((s - 0.25) / 0.4) * Math.sin(TAU * 5.1 * s);
            const mix = smooth(s / len);
            const env = smooth(s / 0.07) * smooth((len - s) / 0.14);
            return (oh(vib) * (1 - mix) + ah(vib) * mix) * 0.16 * env * level;
          };
        });
        cursor += beats * beat;
      }
    };
    place(c.syn.tuneA, 0);
    place(c.syn.tuneB, g.bars / 2);
  };

  /** The ballad's accompaniment: a slow plucked arpeggio on each bar's chord root. */
  const balladPluck: Act5Voice = (t, g, c) => {
    const arp = [0, 2, 4, 2, 0, 2, 4, 7];
    for (let bar = 0; bar < g.bars; bar++) {
      const a = arc(bar, g.bars);
      const rootDegree = c.root(bar, g.bars);
      for (let i = 0; i < 8; i++) {
        const hz = c.d(c.degree(rootDegree + arp[i], 0));
        t.addBuffer(g.start(bar, i * 2), pluck(hz, t.sampleRate, 1.6, 0.4, 0.6, 2000 + bar * 8 + i), 0.5 * (i % 4 === 0 ? 1 : 0.7) * a);
      }
    }
  };

  /** The crew's refrain: a unison "hoh" on the last bar of each four, the singalong the ballad lifts into. */
  const refrainCrew: Act5Voice = (t, g, c) => {
    for (let bar = 3; bar < g.bars; bar += 4) {
      const deg = (bar < g.bars / 2 ? c.syn.vocalA : c.syn.vocalB)[bar % 4];
      const hz = c.d(c.degree(deg, 0));
      const len = g.barSeconds * 0.95;
      lowAdd(t, 3, g.start(bar, 0), len, (lr) => {
        const v = formantVoice(lr, hz, [0.993, 0.998, 1, 1.003, 1.008], OH, { tilt: 1.1, maxHz: 2000, maxK: 14 });
        return (s) => v(1) * 0.12 * smooth(s / 0.15) * smooth((len - s) / 0.25);
      });
    }
  };

  /** `gaut`: a lone low voice and a horn-like saw, the knight who held the stairs. */
  const verseGaut: Act5Voice = (t, g, c) => {
    const sr = t.sampleRate;
    const beat = g.barSamples / 4;
    const place = (tune: readonly (readonly [number, number])[], startBar: number): void => {
      let cursor = startBar * g.barSamples;
      for (const [deg, beats] of tune) {
        const hz = c.d(c.degree(deg, -1));
        const len = ((beats * beat) / sr) * 0.95;
        const dt = hz / sr;
        let phase = 0;
        let l1 = 0;
        t.add(Math.round(cursor), len, (s) => {
          phase += dt;
          if (phase >= 1) phase -= 1;
          l1 += onePole(700 + 500 * smooth(s / 0.3), sr) * (sawBlep(phase, dt) - l1);
          return l1 * 0.5 * smooth(s / 0.08) * smooth((len - s) / 0.15);
        });
        cursor += beats * beat;
      }
    };
    place(c.syn.tuneA, 0);
    place(c.syn.tuneB, g.bars / 2);
  };

  /** Wraps an earlier act's voice for a verse stem, run on the ballad's own grid and chords. */
  const lend = (table: Record<string, Act5Voice | undefined>, name: string): Act5Voice => (t, g, c) => {
    const v = table[name];
    if (v) v(t, g, c);
  };

  return {
    'anvil-kick': anvilKick,
    'stomp-clap': stompClap,
    'steam-hiss': steamHiss,
    'anvil-bass': anvilBass,
    'crew-chant': crewChant,
    'rising-choir': risingChoir,
    'bitter-lead': bitterLead,
    medley,
    heartbeat,
    'crew-hoh': crewHoh,
    'anvil-strike': anvilStrike,
    'ballad-voice': balladVoice,
    'ballad-pluck': balladPluck,
    'refrain-crew': refrainCrew,
    'verse-gaut': verseGaut,
    'verse-keepers': lend(act3 as Record<string, Act5Voice | undefined>, 'falsetto-choir'),
    'verse-houses': crewChant,
    'verse-walkers': (t, g, c) => {
      lend(act4 as Record<string, Act5Voice | undefined>, 'walker-chant')(t, g, c);
      lend(act4 as Record<string, Act5Voice | undefined>, 'hollow-gong')(t, g, c);
    },
  };
}
