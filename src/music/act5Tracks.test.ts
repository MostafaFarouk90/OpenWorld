import { describe, expect, it } from 'vitest';
import {
  ACT5_BOSS_MIX_TRACK,
  ACT5_TRACK_SLOTS,
  CREDITS_FIRST_MIX_KEY,
  CREDITS_LAST_MIX_KEY,
  CREDITS_LAST_TOBB_MIX_KEY,
  CREDITS_VERSE_MIX_KEYS,
  ENDING_THEME_MIX_KEY,
  SIEGE_LULL_MIX_KEY,
  ULTHRED_BUILD_MIX_KEY,
  ULTHRED_DROP_MIX_KEY,
} from './act5Tracks';
import { ACT5_BOSS_MIX_KEYS, CREDITS_CUE_ID, ENDING_THEME_IDS, SIEGE_MIX_KEY, ULTHRED_PHASE_MIX_KEYS } from './act5Slots';
import { MEDLEY_TEXTURES } from './act5Voices';
import voicesSource from './act5Voices.ts?raw';
import tracksSource from './act5Tracks.ts?raw';
import { STEM_PEAK, stemPeak, synthStem } from './stemSynth';
import { ACT5_BOSS_IDS } from '../bosses/act5Bosses';
import { CREDITS, ENDING_LET_IT_DIE, ENDING_REKINDLE, HEART_OF_THE_ANVIL, RESERVED_TRACK_IDS, TRACKS_BY_ID, loopSamples, validateTrack, type StemMix, type TrackDef } from './tracks';

const SR = 8000;
const CUES = [ENDING_REKINDLE, ENDING_LET_IT_DIE, CREDITS];
const ALL5 = [HEART_OF_THE_ANVIL, ...CUES];

describe('Act 5 tracks', () => {
  it('all four are registered with the design BPM and nothing is reserved any more', () => {
    for (const slot of ACT5_TRACK_SLOTS) {
      const track = TRACKS_BY_ID[slot.id];
      expect(track, slot.id).toBeDefined();
      expect(track.bpm).toBe(slot.bpm);
      expect(track.bars).toBe(16);
    }
    expect(RESERVED_TRACK_IDS).toEqual([]);
    expect(HEART_OF_THE_ANVIL.bpm).toBe(100);
  });

  it('Heart of the Anvil uses the design core pattern verbatim', () => {
    expect(HEART_OF_THE_ANVIL.synth?.pattern).toEqual(['B - B t K - t - B - B t K - t K', 'B - t B K - t - B B t - K - ts t']);
    expect(HEART_OF_THE_ANVIL.stems.slice(0, 7)).toEqual(['kick', 'snare', 'hat', 'bass', 'vocal', 'melody', 'boss']);
  });

  it.each(ALL5)('$id validates and every stem renders exactly one loop, finite, at its peak', (track: TrackDef) => {
    expect(() => validateTrack(track)).not.toThrow();
    for (const id of track.stems) {
      const x = synthStem(track, id, SR);
      expect(x.length, id).toBe(loopSamples(track, SR));
      let peak = 0;
      let finite = true;
      for (const v of x) {
        finite &&= Number.isFinite(v);
        peak = Math.max(peak, Math.abs(v));
      }
      expect(finite, id).toBe(true);
      expect(peak, id).toBeCloseTo(stemPeak(track, id), 5);
    }
  });

  it('every stem of every Act 5 track has a STEM_PEAK entry (no stem falls back to the default level)', () => {
    for (const track of ALL5) for (const id of track.stems) expect(STEM_PEAK[id], `${track.id}/${id}`).toBeDefined();
  });

  it('the loudness ceiling: no mix of any Act 5 track, boss phase, hush or cue reaches full scale, and no stem exceeds its shipped peak', () => {
    for (const track of ALL5) {
      const stems = Object.fromEntries(track.stems.map((id) => [id, synthStem(track, id, SR)]));
      const variants: Array<[string, StemMix]> = Object.entries(track.mixes);
      for (const [id, def] of Object.entries(track.bossMixes ?? {})) {
        def.phases.forEach((m, i) => variants.push([`${id} phase ${i + 1}`, m]));
        if (def.hush) variants.push([`${id} hush`, def.hush]);
      }
      for (const [name, mix] of variants) {
        const n = loopSamples(track, SR);
        let peak = 0;
        for (let i = 0; i < n; i++) {
          let v = 0;
          for (const id of track.stems) v += stems[id][i] * (mix[id] ?? 0);
          peak = Math.max(peak, Math.abs(v));
        }
        expect(peak, `${track.id} ${name}`).toBeLessThan(1);
      }
      for (const id of track.stems) {
        let peak = 0;
        for (const v of stems[id]) peak = Math.max(peak, Math.abs(v));
        expect(peak, `${track.id}/${id}`).toBeLessThanOrEqual((STEM_PEAK[id] ?? 0.15) + 1e-9);
      }
    }
  });
});

describe('the Act 5 slots resolve (v0.9 item 17)', () => {
  it('every boss, phase, siege and step key has a mix on the track it is fought on', () => {
    const keys = [...ACT5_BOSS_MIX_KEYS, ...ULTHRED_PHASE_MIX_KEYS, SIEGE_MIX_KEY, SIEGE_LULL_MIX_KEY, ULTHRED_DROP_MIX_KEY, ULTHRED_BUILD_MIX_KEY];
    for (const key of keys) {
      const track = TRACKS_BY_ID[ACT5_BOSS_MIX_TRACK[key]];
      expect(track, key).toBeDefined();
      expect(track.bossMixes?.[key], key).toBeDefined();
    }
  });

  it('the boss ids are the registry ids, and Ulthred has three phases and Vey one with a hush', () => {
    for (const id of Object.values(ACT5_BOSS_IDS)) expect(HEART_OF_THE_ANVIL.bossMixes?.[id], id).toBeDefined();
    expect(HEART_OF_THE_ANVIL.bossMixes?.ulthred.phases).toHaveLength(3);
    expect(HEART_OF_THE_ANVIL.bossMixes?.vey.phases).toHaveLength(1);
    expect(HEART_OF_THE_ANVIL.bossMixes?.vey.hush).toBeDefined();
    for (const [i, key] of ULTHRED_PHASE_MIX_KEYS.entries()) {
      expect(HEART_OF_THE_ANVIL.bossMixes?.[key].phases[0]).toEqual(HEART_OF_THE_ANVIL.bossMixes?.ulthred.phases[i]);
    }
  });

  it('the ending themes and the credits are tracks, each with the mix its helper starts', () => {
    for (const id of ENDING_THEME_IDS) expect(TRACKS_BY_ID[id].bossMixes?.[ENDING_THEME_MIX_KEY], id).toBeDefined();
    const credits = TRACKS_BY_ID[CREDITS_CUE_ID];
    for (const key of [CREDITS_FIRST_MIX_KEY, ...CREDITS_VERSE_MIX_KEYS, CREDITS_LAST_MIX_KEY, CREDITS_LAST_TOBB_MIX_KEY]) expect(credits.bossMixes?.[key], key).toBeDefined();
  });

  it('phase 2 brings the medley in and phase 3 the heartbeat; the drop is the bass and the heartbeat alone', () => {
    const u = HEART_OF_THE_ANVIL.bossMixes!.ulthred.phases;
    expect(u[0].medley).toBe(0);
    expect(u[1].medley).toBe(1);
    expect(u[2].heartbeat).toBeGreaterThan(0);
    const drop = HEART_OF_THE_ANVIL.bossMixes![ULTHRED_DROP_MIX_KEY].phases[0];
    expect(Object.entries(drop).filter(([, g]) => g > 0).map(([s]) => s).sort()).toEqual(['bass', 'heartbeat']);
  });

  it('the mixes of each credits verse bring in exactly their own verse stem', () => {
    const credits = TRACKS_BY_ID[CREDITS_CUE_ID];
    for (const [i, key] of CREDITS_VERSE_MIX_KEYS.entries()) {
      const stem = ['verse-gaut', 'verse-keepers', 'verse-houses', 'verse-walkers'][i];
      const m = credits.bossMixes![key].phases[0];
      expect(m[stem], key).toBeGreaterThan(0);
      for (const other of ['verse-gaut', 'verse-keepers', 'verse-houses', 'verse-walkers'].filter((s) => s !== stem)) expect(m[other], `${key}/${other}`).toBe(0);
    }
  });
});

describe('the medley stem (Ulthred phase 2)', () => {
  const x = synthStem(HEART_OF_THE_ANVIL, 'medley', SR);
  const win = x.length / 8;

  it('quotes seven areas in turn, each window audible, then the tutti', () => {
    expect(MEDLEY_TEXTURES).toHaveLength(7);
    for (let i = 0; i < 8; i++) {
      let sq = 0;
      for (let k = 0; k < win; k++) sq += x[Math.floor(i * win + k)] ** 2;
      expect(Math.sqrt(sq / win), `window ${i}`).toBeGreaterThan(0.005);
    }
  });

  it('the windows differ: no two sections are the same sound', () => {
    const rms: number[] = [];
    const zc: number[] = [];
    for (let i = 0; i < 7; i++) {
      let sq = 0;
      let crossings = 0;
      for (let k = 1; k < win; k++) {
        const a = x[Math.floor(i * win + k)];
        sq += a * a;
        if (a * x[Math.floor(i * win + k - 1)] < 0) crossings++;
      }
      rms.push(Math.sqrt(sq / win));
      zc.push(crossings);
    }
    const sig = rms.map((r, i) => `${r.toFixed(3)}/${zc[i]}`);
    expect(new Set(sig).size).toBe(7);
  });

  it('is rendered in this file, never layered from another track: the voices source imports no TrackDef and no track module', () => {
    const src = voicesSource;
    expect(src).not.toMatch(/from '\.\/(tracks|act[1-5]Tracks|act\d*\.tracks)'/);
    expect(src).not.toMatch(/\bTrackDef\b/);
    expect(src).not.toMatch(/TRACKS_BY_ID/);
    expect(tracksSource).not.toMatch(/from '\.\/act[1-4]Tracks'/);
  });
});
