import { describe, expect, it } from 'vitest';
import { createAct3Voices } from './act3Voices';
import { STEM_PEAK, synthStem as synthRaw } from './stemSynth';
import { BARLEY_AND_BRAZIER, HAMMERS_BELOW, PEAT_AND_PITCH, WING_OVER_RIME, loopSamples, validateTrack, type MixState, type StemMix, type TrackDef } from './tracks';

// Quality guards for the two Act 3 tracks (K14), in the spirit of stemSynth.quality.test.ts and act2.tracks.test.ts:
// shape, level, determinism, brightness and phrasing guards per stem, the boss/trial mix tables, and the chant seam.

const SR = 8000;

/** Renders are deterministic (asserted below against the raw synth), so the tests share one render per stem and rate. */
const cache = new Map<string, Float32Array>();
const synthStem = (track: TrackDef, id: string, rate: number): Float32Array => {
  const key = `${track.id}/${id}/${rate}`;
  let x = cache.get(key);
  if (!x) cache.set(key, (x = synthRaw(track, id, rate)));
  return x;
};
const TRACKS: TrackDef[] = [PEAT_AND_PITCH, WING_OVER_RIME];

const rms = (x: Float32Array, from = 0, to = x.length): number => {
  let sq = 0;
  for (let i = from; i < to; i++) sq += x[i] ** 2;
  return Math.sqrt(sq / Math.max(1, to - from));
};

/** Spectral-centroid proxy in Hz: rms(first difference) / rms(signal) * sr / 2pi (exact for a sine, rises with brightness). */
const brightness = (x: Float32Array, sr: number): number => {
  let sq = 0;
  for (let i = 1; i < x.length; i++) sq += (x[i] - x[i - 1]) ** 2;
  return (Math.sqrt(sq / (x.length - 1)) / rms(x)) * (sr / (2 * Math.PI));
};

describe.each(TRACKS)('$id stems', (track) => {
  it('validates with 16 bars, and every stem is exactly loopSamples long (8 kHz)', () => {
    expect(() => validateTrack(track)).not.toThrow();
    expect(track.bars).toBe(16);
    for (const id of track.stems) expect(synthStem(track, id, SR).length, id).toBe(loopSamples(track, SR));
  });

  it.each(track.stems)('%s is finite, normalised to its peak, not clipping, and has a sane level', (id) => {
    const x = synthStem(track, id, SR);
    let peak = 0;
    let bad = 0;
    for (const v of x) {
      if (!Number.isFinite(v)) bad++;
      peak = Math.max(peak, Math.abs(v));
    }
    expect(bad).toBe(0);
    expect(peak).toBeCloseTo(STEM_PEAK[id] ?? 0.15, 4);
    expect(peak).toBeLessThan(0.5);
    const r = rms(x);
    expect(r).toBeGreaterThan(0.003);
    expect(r).toBeLessThan(peak);
  });

  it('renders are deterministic', () => {
    for (const id of track.stems) expect(synthRaw(track, id, SR), id).toEqual(synthStem(track, id, SR));
  });

  it.each(track.stems.filter((s) => s !== 'chant'))('%s builds and breathes: its bars do not all have the same energy', (id) => {
    const x = synthStem(track, id, SR);
    const bar = Math.floor(x.length / track.bars);
    const overall = rms(x);
    const levels = new Set<number>();
    for (let b = 0; b < track.bars; b++) levels.add(Math.round((rms(x, b * bar, (b + 1) * bar) / overall) * 50));
    expect(levels.size).toBeGreaterThanOrEqual(id === 'boss' ? 3 : 5);
  });

  it('the stems sit in sensible registers: kick and bass dark, the hat brighter than the bass and (on Wing over Rime) than the whistle', () => {
    const b = (id: string): number => brightness(synthStem(track, id, 48000), 48000);
    const [kick, bass, melody, hat] = [b('kick'), b('bass'), b('melody'), b('hat')];
    expect(kick).toBeLessThan(900);
    expect(bass).toBeLessThan(1000);
    expect(melody).toBeGreaterThan(bass);
    expect(hat).toBeGreaterThan(2 * bass);
    // Peat and Pitch's hat is bubble pops (sine chirps, 400 to 1200 Hz), so it is not the brightest stem there.
    if (track.id === WING_OVER_RIME.id) expect(hat).toBeGreaterThan(Math.max(melody, 1500));
    else expect(hat).toBeGreaterThan(800);
  });

  it('drum onsets vary: the kick hits differ in level and the hat is not a flat machine tick', () => {
    for (const id of ['kick', 'hat', 'snare']) {
      const x = synthStem(track, id, SR);
      const win = Math.round(0.02 * SR);
      const peaks = new Set<number>();
      for (let i = 0; i + win < x.length; i += win) {
        let p = 0;
        for (let j = i; j < i + win; j++) p = Math.max(p, Math.abs(x[j]));
        if (p > 0.1 * STEM_PEAK[id]) peaks.add(Math.round(p * 200));
      }
      expect(peaks.size, id).toBeGreaterThanOrEqual(6);
    }
  });
});

describe('synth cost at 48 kHz', () => {
  it('every stem is the canonical length and renders inside a generous budget (measured and printed)', () => {
    const rows: string[] = [];
    for (const track of TRACKS) {
      for (const id of track.stems) {
        const t0 = performance.now();
        const x = synthRaw(track, id, 48000);
        const secs = (performance.now() - t0) / 1000;
        rows.push(`${track.id} ${id}: ${secs.toFixed(3)} s`);
        expect(x.length).toBe(loopSamples(track, 48000));
        // Target is about 0.6 s per stem (measured 0.04 to 0.55 s); the 2 s ceiling is wide on purpose so a slow CI machine does not flake.
        expect(secs, `${track.id} ${id}`).toBeLessThan(2);
      }
    }
    console.info(`Act 3 synth cost per stem at 48 kHz\n${rows.join('\n')}`);
  }, 60000);
});

describe('Wing over Rime chant seam (a 3-minute run has no audible join)', () => {
  const SR48 = 48000;
  const loop = synthStem(WING_OVER_RIME, 'chant', SR48);
  const n = loop.length;
  const seconds = 180;
  const total = seconds * SR48;
  const tiled = new Float32Array(total);
  for (let i = 0; i < total; i++) tiled[i] = loop[i % n];
  const joins: number[] = [];
  for (let k = 1; k * n < total; k++) joins.push(k * n);

  it('the loop is 38.4 s, so 180 s tiles it 4.7 times with four joins', () => {
    expect(n).toBe(loopSamples(WING_OVER_RIME, SR48));
    expect(joins).toHaveLength(4);
  });

  it('the sample step across every join is within the stem\'s own 99.9th percentile step', () => {
    const steps = new Float32Array(n - 1);
    for (let i = 1; i < n; i++) steps[i - 1] = Math.abs(loop[i] - loop[i - 1]);
    const sorted = Float32Array.from(steps).sort();
    const p999 = sorted[Math.floor(sorted.length * 0.999)];
    expect(p999).toBeGreaterThan(0);
    for (const j of joins) expect(Math.abs(tiled[j] - tiled[j - 1]), `join at ${j}`).toBeLessThanOrEqual(p999);
  });

  it('the RMS of the 50 ms either side of every join differs by under 3 dB', () => {
    const w = Math.round(0.05 * SR48);
    for (const j of joins) {
      const before = rms(tiled, j - w, j);
      const after = rms(tiled, j, j + w);
      expect(Math.abs(20 * Math.log10(before / after)), `join at ${j}`).toBeLessThan(3);
    }
  });

  it('it is a sustained chant: no silent gaps anywhere in the loop (every 0.5 s window holds sound)', () => {
    const w = Math.round(0.5 * SR48);
    const overall = rms(loop);
    for (let i = 0; i + w <= n; i += w) expect(rms(loop, i, i + w)).toBeGreaterThan(overall * 0.25);
  });

  it('the four 4-bar phrases are distinct', () => {
    const q = Math.floor(n / 4);
    const spectra = [0, 1, 2, 3].map((p) => {
      const hz = [147, 165, 185, 220, 247, 294, 330, 370];
      const seg = loop.subarray(p * q, p * q + 4 * SR48);
      return hz.map((f) => {
        const wv = (2 * Math.PI * f) / SR48;
        const c = 2 * Math.cos(wv);
        let s1 = 0;
        let s2 = 0;
        for (let i = 0; i < seg.length; i++) {
          const s0 = seg[i] + c * s1 - s2;
          s2 = s1;
          s1 = s0;
        }
        return Math.sqrt(s1 * s1 + s2 * s2 - c * s1 * s2);
      });
    });
    for (let a = 0; a < 4; a++) for (let b = a + 1; b < 4; b++) expect(spectra[a].map((v) => v.toFixed(0)).join(), `${a} vs ${b}`).not.toBe(spectra[b].map((v) => v.toFixed(0)).join());
  });
});

describe('mixes', () => {
  const STATES: MixState[] = ['explore', 'discover', 'silence', 'combat', 'boss', 'ending', 'talk', 'stealth', 'chase'];
  const allMixes = (track: TrackDef): Array<[string, StemMix]> => {
    const out: Array<[string, StemMix]> = STATES.map((s) => [s, track.mixes[s]]);
    for (const [id, def] of Object.entries(track.bossMixes ?? {})) {
      def.phases.forEach((m, i) => out.push([`${id} phase ${i + 1}`, m]));
      if (def.hush) out.push([`${id} hush`, def.hush]);
    }
    for (const [k, m] of Object.entries(track.stealthAlert ?? {})) out.push([`stealth ${k}`, m]);
    return out;
  };

  it('design 6.3 explore, discover and combat gains', () => {
    expect(PEAT_AND_PITCH.mixes.explore).toEqual({ kick: 0, snare: 0, hat: 0.15, bass: 0.6, vocal: 0.4, melody: 0, boss: 0 });
    expect(PEAT_AND_PITCH.mixes.discover.melody).toBe(0.9);
    expect(PEAT_AND_PITCH.mixes.combat).toEqual({ kick: 1, snare: 0.9, hat: 0.8, bass: 1, vocal: 0.9, melody: 0.4, boss: 0 });
    expect(WING_OVER_RIME.mixes.explore).toMatchObject({ kick: 0, snare: 0, hat: 0.15, bass: 0.55, vocal: 0.45, melody: 0, boss: 0 });
    expect(WING_OVER_RIME.mixes.discover.melody).toBe(0.9);
    expect(WING_OVER_RIME.mixes.combat).toMatchObject({ kick: 1, snare: 1, hat: 0.9, bass: 1, vocal: 1, melody: 0.5, boss: 0 });
  });

  it('the patterns are the 6.3 core patterns, on 90 and 100 BPM', () => {
    expect(PEAT_AND_PITCH.synth!.pattern).toEqual(['B - - t - K - t B - t - - K - t', 'B - t - - K t - B - - t K - t ts']);
    expect(WING_OVER_RIME.synth!.pattern).toEqual(['B - t - K - t B B - t - K - t t', 'B - t t K - t - B - B t K - ts -']);
    expect([PEAT_AND_PITCH.bpm, WING_OVER_RIME.bpm]).toEqual([90, 100]);
    expect(WING_OVER_RIME.synth!.scale).toEqual([0, 2, 4, 6, 7, 9, 11]);
    expect(WING_OVER_RIME.synth!.tonic).toBe(146.83);
    for (const t of TRACKS) {
      expect(t.synth!.tuneA.reduce((n, [, b]) => n + b, 0)).toBe(32);
      expect(t.synth!.tuneB.reduce((n, [, b]) => n + b, 0)).toBe(32);
      for (const bar of [...t.synth!.pattern, ...t.synth!.bHatExtra]) expect(bar.trim().split(/\s+/)).toHaveLength(16);
    }
  });

  it('Peat and Pitch has the seven stems; Wing over Rime the same seven plus chant', () => {
    expect(PEAT_AND_PITCH.stems).toEqual(['kick', 'snare', 'hat', 'bass', 'vocal', 'melody', 'boss']);
    expect(WING_OVER_RIME.stems).toEqual(['kick', 'snare', 'hat', 'bass', 'vocal', 'melody', 'boss', 'chant']);
  });

  it('Murkjaw: three phases, phase 1 has hat 0 and vocal 1, later phases bring the hat back and lift the melody; no hush', () => {
    const m = PEAT_AND_PITCH.bossMixes!.murkjaw;
    expect(m.phases).toHaveLength(3);
    expect(m.phases[0].hat).toBe(0);
    expect(m.phases[0].vocal).toBe(1);
    expect(m.phases[1].hat).toBe(1);
    expect(m.phases[2].hat).toBe(1);
    expect(m.phases[0].melody).toBeLessThan(m.phases[1].melody);
    expect(m.phases[1].melody).toBeLessThan(m.phases[2].melody);
    expect(m.hush).toBeUndefined();
    expect(Object.keys(PEAT_AND_PITCH.bossMixes!)).toEqual(['murkjaw']);
  });

  it('Corvin Skarl: two phases and a hush with the drums out and the bass and boss chant held', () => {
    const s = WING_OVER_RIME.bossMixes!['corvin-skarl'];
    expect(s.phases).toHaveLength(2);
    expect(s.hush).toBeDefined();
    expect(s.hush!.kick).toBe(0);
    expect(s.hush!.snare).toBe(0);
    expect(s.hush!.bass).toBeGreaterThanOrEqual(0.7);
    expect(s.hush!.boss).toBe(1);
    expect(s.phases[0].boss).toBe(1);
  });

  it('the Ysmeryth trial mix has the chant at 1 and the boss stem out, drums soft', () => {
    const trial = WING_OVER_RIME.bossMixes!['ysmeryth-trial'];
    expect(trial.phases.length).toBeGreaterThanOrEqual(1);
    for (const m of trial.phases) {
      expect(m.chant).toBe(1);
      expect(m.boss).toBe(0);
      expect(m.kick).toBeLessThanOrEqual(0.3);
      expect(m.snare).toBeLessThanOrEqual(0.3);
      expect(m.melody).toBeGreaterThanOrEqual(0.6);
      expect(m.bass).toBe(0.7);
      expect(m.vocal).toBe(0.5);
    }
  });

  it('chant is 0 (or absent) in every mix except the trial; Peat and Pitch has no chant anywhere', () => {
    for (const [name, m] of allMixes(WING_OVER_RIME)) {
      if (name.startsWith('ysmeryth-trial')) continue;
      expect(m.chant ?? 0, name).toBe(0);
    }
    for (const [name, m] of allMixes(PEAT_AND_PITCH)) expect(m.chant, name).toBeUndefined();
  });

  it('every mix is in range and the combined combat and boss mixes of the stems stay under full scale', () => {
    for (const track of TRACKS) {
      for (const [name, m] of allMixes(track)) {
        let sum = 0;
        for (const [stem, gain] of Object.entries(m)) {
          expect(gain, `${track.id} ${name} ${stem}`).toBeGreaterThanOrEqual(0);
          expect(gain).toBeLessThanOrEqual(1);
          sum += gain * (STEM_PEAK[stem] ?? 0.15);
        }
        expect(sum, `${track.id} ${name}`).toBeLessThan(2.2);
      }
    }
  });
});

describe('voice names and the named-only stem', () => {
  const table = createAct3Voices({ tokens: () => [], arc: () => 1, Feel: class {} as never });

  it('every voice a track names resolves in the Act 3 table (a typo would silently fall back to an Act 1 voice)', () => {
    for (const track of TRACKS) {
      for (const name of Object.values(track.synth!.voices as Record<string, string>)) expect(table[name], `${track.id} ${name}`).toBeTypeOf('function');
    }
  });

  it('the Act 1 and 2 tracks name no Act 3 voice', () => {
    for (const track of [BARLEY_AND_BRAZIER, HAMMERS_BELOW]) {
      for (const name of Object.values(track.synth!.voices as Record<string, string>)) expect(table[name], name).toBeUndefined();
    }
  });

  it('a stem with no Act 1 voice resolves its named voice, and throws when there is none', () => {
    expect(synthStem(WING_OVER_RIME, 'chant', SR).length).toBe(loopSamples(WING_OVER_RIME, SR));
    expect(() => synthStem(PEAT_AND_PITCH, 'chant', SR)).toThrow(/chant/);
    expect(() => synthStem(BARLEY_AND_BRAZIER, 'chant', SR)).toThrow(/chant/);
    expect(() => synthStem(WING_OVER_RIME, 'nonsense', SR)).toThrow(/nonsense/);
  });
});
