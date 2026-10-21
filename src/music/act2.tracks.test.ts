import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAct2Voices } from './act2Voices';
import { BarClock } from './barClock';
import { MusicDirector } from './MusicDirector';
import { synthStem } from './stemSynth';
import { ASH_ON_THE_PASTURE as ASH, BARLEY_AND_BRAZIER, HAMMERS_BELOW as HAMMERS, RESERVED_TRACK_IDS, SEVEN_GATES_ONE_DRUM, TRACKS_BY_ID, loopSamples, loopSeconds, validateTrack, type StemMix, type TrackDef } from './tracks';

const SR = 8000;
const TRACKS: TrackDef[] = [ASH, HAMMERS];

afterEach(() => vi.restoreAllMocks());

const mix = (kick: number, snare: number, hat: number, bass: number, vocal: number, melody: number, boss: number): StemMix => ({ kick, snare, hat, bass, vocal, melody, boss });

describe.each(TRACKS)('$id data', (track) => {
  it('validates, has the seven pinned stems and 16 bars', () => {
    expect(() => validateTrack(track)).not.toThrow();
    expect(track.stems).toEqual(['kick', 'snare', 'hat', 'bass', 'vocal', 'melody', 'boss']);
    expect(track.bars).toBe(16);
  });

  it('is registered by id and no longer reserved', () => {
    expect(TRACKS_BY_ID[track.id]).toBe(track);
    expect(RESERVED_TRACK_IDS).not.toContain(track.id);
  });

  it('every stem is exactly loopSamples long (8 kHz, all stems)', () => {
    for (const id of track.stems) expect(synthStem(track, id, SR).length, id).toBe(loopSamples(track, SR));
  });

  it('renders are deterministic', () => {
    for (const id of track.stems) expect(synthStem(track, id, SR), id).toEqual(synthStem(track, id, SR));
  });

  it('the tunes fill eight bars each (32 beats) and the patterns are two bars of 16 steps', () => {
    const syn = track.synth!;
    for (const tune of [syn.tuneA, syn.tuneB]) expect(tune.reduce((n, [, beats]) => n + beats, 0)).toBe(32);
    expect(syn.pattern).toHaveLength(2);
    for (const bar of syn.pattern) expect(bar.trim().split(/\s+/)).toHaveLength(16);
    expect(syn.scale).toHaveLength(7);
  });

  it('the stealth overlay, chase and talk mixes carry no boss stem, and the alerts keep the stealth bass', () => {
    for (const state of ['stealth', 'chase', 'talk'] as const) expect(track.mixes[state].boss).toBe(0);
    expect(track.stealthAlert!.suspicious.bass).toBe(track.mixes.stealth.bass);
    expect(track.stealthAlert!.alerted.bass).toBe(track.mixes.stealth.bass);
  });
});

describe('timing', () => {
  it('94 and 98 BPM bar and loop lengths match design 6.2', () => {
    expect(240 / ASH.bpm).toBeCloseTo(2.553, 2);
    expect(loopSeconds(ASH, 44100)).toBeCloseTo(40.85, 1);
    expect(240 / HAMMERS.bpm).toBeCloseTo(2.449, 2);
    expect(loopSeconds(HAMMERS, 44100)).toBeCloseTo(39.18, 1);
  });

  it('every stem at 44.1 kHz is the canonical length and stays inside a generous synth-time budget', () => {
    // Measured about 0.05 to 0.7 s per stem in Node (each is one main-thread task between yields); the ceiling only catches a blow-up.
    for (const track of TRACKS) {
      for (const id of track.stems) {
        const t0 = performance.now();
        const x = synthStem(track, id, 44100);
        expect(x.length, `${track.id} ${id}`).toBe(Math.round(((16 * 240) / track.bpm) * 44100));
        expect(performance.now() - t0, `${track.id} ${id}`).toBeLessThan(4000);
      }
    }
  }, 60000);
});

describe('mixes match design 6.1 and 6.3', () => {
  it('Ash on the Pasture', () => {
    expect(ASH.mixes.explore).toEqual(mix(0, 0, 0.15, 0.6, 0.35, 0, 0));
    expect(ASH.mixes.discover).toEqual(mix(0, 0, 0.15, 0.6, 0.35, 0.9, 0));
    expect(ASH.mixes.combat).toEqual(mix(1, 1, 0.85, 1, 0.9, 0.4, 0));
    expect(ASH.mixes.boss).toEqual(mix(1, 1, 1, 1, 1, 0.7, 1));
    expect(ASH.mixes.ending).toEqual(mix(0, 0, 0, 0.4, 0, 1, 0));
    expect(ASH.mixes.talk).toEqual(mix(0, 0, 0, 0.5, 0, 0.5, 0));
    expect(ASH.mixes.silence).toEqual(mix(0, 0, 0, 0, 0, 0, 0));
    expect(ASH.mixes.stealth.vocal).toBeCloseTo(ASH.mixes.explore.vocal - 0.05, 9);
  });

  it('Hammers Below', () => {
    expect(HAMMERS.mixes.explore).toEqual(mix(0, 0, 0.15, 0.65, 0.4, 0, 0));
    expect(HAMMERS.mixes.discover).toEqual(mix(0, 0, 0.15, 0.65, 0.4, 0.9, 0));
    expect(HAMMERS.mixes.combat).toEqual(mix(1, 1, 0.9, 1, 1, 0.3, 0));
    expect(HAMMERS.mixes.talk).toEqual(mix(0, 0, 0, 0.5, 0, 0.5, 0));
    expect(HAMMERS.mixes.stealth.vocal).toBeCloseTo(HAMMERS.mixes.explore.vocal - 0.05, 9);
  });

  it('the patterns are the 6.3 core patterns', () => {
    expect(ASH.synth!.pattern).toEqual(['B - t t K - t - B t B - K - t t', 'B - t - K t t - B - t B K - ts -']);
    expect(HAMMERS.synth!.pattern).toEqual(['B - - B K - t - B - t - K - B t', 'B - B - K - t t B - t B K - ts t']);
  });
});

describe('boss mixes', () => {
  it('are keyed by the boss ids, and only on their own tracks', () => {
    expect(Object.keys(ASH.bossMixes!)).toEqual(['thrandil-redmane']);
    expect(Object.keys(HAMMERS.bossMixes!)).toEqual(['the-slagmaw']);
    expect(BARLEY_AND_BRAZIER.bossMixes!['thrandil-redmane']).toBeUndefined();
    expect(SEVEN_GATES_ONE_DRUM.bossMixes!['the-slagmaw']).toBeUndefined();
  });

  it('Redmane has two phases and a hush that silences the gallop stem; the Slagmaw has three phases and no hush', () => {
    const r = ASH.bossMixes!['thrandil-redmane'];
    expect(r.phases).toHaveLength(2);
    expect(r.hush).toEqual(mix(0, 0, 0.3, 0.8, 0.6, 0.5, 0));
    expect(r.phases.at(-1)).toEqual(mix(1, 1, 1, 1, 1, 1, 1));
    const s = HAMMERS.bossMixes!['the-slagmaw'];
    expect(s.phases).toHaveLength(3);
    expect(s.hush).toBeUndefined();
    expect(s.phases[0].hat).toBeLessThan(s.phases[1].hat);
  });
});

function director(track: TrackDef) {
  const calls: Array<Readonly<Record<string, number>>> = [];
  const d = new MusicDirector({ track, driver: { setMix: (m) => void calls.push(m) }, random: () => 0.5 });
  d.start(new BarClock(0, loopSeconds(track, 48000), track.bars), 0);
  let now = 0;
  const run = (secs: number): void => {
    const end = now + secs;
    while (now < end - 1e-9) {
      now = Math.min(end, now + 1 / 60);
      d.update(now, () => undefined);
    }
  };
  return { d, calls, run };
}

describe('boss fights pick the Act 2 mixes', () => {
  it('Redmane: phase 1, phase 2, then the Spare window hushes and closing it restores', () => {
    const t = director(ASH);
    const r = ASH.bossMixes!['thrandil-redmane'];
    t.d.bossStarted('thrandil-redmane', 1, 0);
    t.run(0.1);
    expect(t.calls.at(-1)).toBe(r.phases[0]);
    t.d.bossPhase('thrandil-redmane', 2);
    t.run(0.1);
    expect(t.calls.at(-1)).toBe(r.phases[1]);
    t.d.bossPhase('thrandil-redmane', 3); // past the table clamps to the last
    t.run(0.1);
    expect(t.calls.at(-1)).toBe(r.phases[1]);
    t.d.bossHush('thrandil-redmane', true);
    t.run(0.1);
    expect(t.calls.at(-1)).toBe(r.hush);
    expect(t.calls.at(-1)!.boss).toBe(0);
    t.d.bossHush('thrandil-redmane', false);
    t.run(0.1);
    expect(t.calls.at(-1)).toBe(r.phases[1]);
  });

  it('the Slagmaw is untouched by the release window the registry opens at the last break', () => {
    const t = director(HAMMERS);
    const s = HAMMERS.bossMixes!['the-slagmaw'];
    t.d.bossStarted('the-slagmaw', 3, 0);
    t.run(0.1);
    const before = t.calls.at(-1);
    expect(before).toBe(s.phases[2]);
    t.d.bossHush('the-slagmaw', true);
    t.run(0.1);
    expect(t.calls.at(-1)).toBe(s.phases[2]);
    expect(t.calls.at(-1)!.boss).toBe(1);
  });

  it('a boss id from the other track falls back to the generic boss mix, warning once', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const t = director(HAMMERS);
    t.d.bossStarted('thrandil-redmane', 1, 0);
    t.run(0.1);
    expect(t.calls.at(-1)).toBe(HAMMERS.mixes.boss);
    expect(warn).toHaveBeenCalledTimes(1);
  });
});

// --- voice character -----------------------------------------------------------------------------

const barOf = (track: TrackDef, bar: number, x: Float32Array): Float32Array => {
  const n = Math.floor(x.length / track.bars);
  return x.subarray(bar * n, (bar + 1) * n);
};

const energy = (x: Float32Array, from = 0, to = x.length): number => {
  let sq = 0;
  for (let i = from; i < to; i++) sq += x[i] ** 2;
  return Math.sqrt(sq / (to - from));
};

describe('Redmane gallop stem', () => {
  const boss = synthStem(ASH, 'boss', SR);
  const step = loopSamples(ASH, SR) / 16 / 16;

  it('has twelve clops a bar: three to every beat at steps 0, 2 and 3, with a gap at step 1', () => {
    for (const bar of [1, 3, 9, 15]) {
      const x = barOf(ASH, bar, boss);
      const w = (from: number, to: number): number => {
        let peak = 0;
        for (let i = Math.max(0, Math.round(from * step)); i < Math.round(to * step); i++) peak = Math.max(peak, Math.abs(x[i]));
        return peak;
      };
      for (let beat = 0; beat < 4; beat++) {
        const o = beat * 4;
        const gap = w(o + 0.9, o + 1.9);
        for (const clop of [0, 2, 3]) expect(w(o + clop - 0.3, o + clop + 0.6), `bar ${bar} beat ${beat} step ${clop}`).toBeGreaterThan(gap * 1.3);
      }
    }
  });

  it('the "Hey!" lands on even bars only, late in the bar', () => {
    const late = (bar: number): number => {
      const x = barOf(ASH, bar, boss);
      return energy(x, Math.round(12.2 * step), Math.round(15.5 * step));
    };
    const evenAvg = (late(2) + late(4) + late(6)) / 3;
    const oddAvg = (late(1) + late(3) + late(5)) / 3;
    expect(evenAvg).toBeGreaterThan(oddAvg * 1.3);
  });
});

describe('Slagmaw boss stem', () => {
  const boss = synthStem(HAMMERS, 'boss', SR);
  const vocal = synthStem(HAMMERS, 'vocal', SR);
  const step = loopSamples(HAMMERS, SR) / 16 / 16;

  it('is a half-time pound: a heavy hit at step 0 of every bar, the second dropped every fourth bar', () => {
    const second = (bar: number): number => energy(barOf(HAMMERS, bar, boss), Math.round(8.1 * step), Math.round(9.3 * step));
    const first = (bar: number): number => energy(barOf(HAMMERS, bar, boss), Math.round(0.1 * step), Math.round(1.3 * step));
    expect(first(3)).toBeGreaterThan(0);
    expect(second(0)).toBeGreaterThan(second(3) * 1.4);
  });

  it('is irregular: the clang moves earlier in every third bar', () => {
    const at = (bar: number, a: number, b: number): number => energy(barOf(HAMMERS, bar, boss), Math.round(a * step), Math.round(b * step));
    // Bar 1 puts its clang on step 10; bar 2 on step 12.
    expect(at(1, 10.1, 11.4)).toBeGreaterThan(at(2, 10.1, 11.4));
    expect(at(2, 12.1, 13.4)).toBeGreaterThan(at(1, 12.1, 13.4));
  });

  it('carries the roar: a saturated chant sustains between the pounds, and the vocal stem stays a clean stem', () => {
    // Steps 4 to 7 hold no pound or clang: only the roar and the quiet hat ticks, so a stem without the roar would sit well below this.
    const seg = barOf(HAMMERS, 5, boss).subarray(Math.round(4.3 * step), Math.round(7.5 * step));
    expect(energy(seg)).toBeGreaterThan(energy(boss) * 0.2);
    // The vocal stem is the same whatever the boss voice is: render it with a different boss voice name.
    const other: TrackDef = { ...HAMMERS, synth: { ...HAMMERS.synth!, voices: { ...HAMMERS.synth!.voices, boss: 'steam-anvil' } } };
    expect(Array.from(synthStem(other, 'vocal', SR))).toEqual(Array.from(vocal));
  });
});

describe('voice names', () => {
  it('every Act 2 voice a track names resolves in the Act 2 table (a typo would silently fall back to an Act 1 voice)', () => {
    const table = createAct2Voices({ tokens: () => [], arc: () => 1, Feel: class {} as never });
    for (const track of TRACKS) {
      const v = track.synth!.voices as Record<string, string | undefined>;
      for (const name of Object.values(v)) expect(table[name as string], `${track.id} ${name}`).toBeTypeOf('function');
    }
  });

  it('Act 1 tracks name no Act 2 voice', () => {
    const table = createAct2Voices({ tokens: () => [], arc: () => 1, Feel: class {} as never });
    for (const track of [BARLEY_AND_BRAZIER, SEVEN_GATES_ONE_DRUM]) {
      for (const name of Object.values(track.synth!.voices)) expect(table[name as string], name).toBeUndefined();
    }
  });
});
