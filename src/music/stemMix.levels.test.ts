import { describe, expect, it } from 'vitest';
import { STEM_PEAK, synthStem } from './stemSynth';
import { BARLEY_AND_BRAZIER, SEVEN_GATES_ONE_DRUM, loopSamples, type StemMix, type TrackDef } from './tracks';

// Level guard for the music-quality voices: every mix variant stays under full scale, the states sit in
// a sensible loudness order against explore, and nothing drops far below the old sound.

const SR = 8000;

function rendered(track: TrackDef): Record<string, Float32Array> {
  return Object.fromEntries(track.stems.map((id) => [id, synthStem(track, id, SR)]));
}

function sum(track: TrackDef, stems: Record<string, Float32Array>, mix: StemMix): { peak: number; rms: number } {
  const n = loopSamples(track, SR);
  let peak = 0;
  let sq = 0;
  for (let i = 0; i < n; i++) {
    let v = 0;
    for (const id of track.stems) v += stems[id][i] * (mix[id] ?? 0);
    peak = Math.max(peak, Math.abs(v));
    sq += v * v;
  }
  return { peak, rms: Math.sqrt(sq / n) };
}

const db = (x: number): number => 20 * Math.log10(x);

describe.each([BARLEY_AND_BRAZIER, SEVEN_GATES_ONE_DRUM])('$id levels', (track) => {
  const stems = rendered(track);

  it('stem peaks are exactly their STEM_PEAK', () => {
    for (const id of track.stems) {
      let peak = 0;
      for (const v of stems[id]) peak = Math.max(peak, Math.abs(v));
      expect(peak).toBeCloseTo(STEM_PEAK[id], 5);
    }
  });

  it('every mix variant (states, boss phases, hush, stealth alerts) stays under full scale', () => {
    const variants: Array<[string, StemMix]> = Object.entries(track.mixes);
    for (const [id, def] of Object.entries(track.bossMixes ?? {})) {
      def.phases.forEach((m, i) => variants.push([`${id} phase ${i + 1}`, m]));
      if (def.hush) variants.push([`${id} hush`, def.hush]);
    }
    for (const [level, m] of Object.entries(track.stealthAlert ?? {})) variants.push([`alert ${level}`, m]);
    for (const [name, mix] of variants) expect(sum(track, stems, mix).peak, name).toBeLessThan(1);
  });

  it('explore is audible, combat and boss are louder than it, and the quiet states are not far below it', () => {
    const rms = (state: keyof TrackDef['mixes']): number => db(sum(track, stems, track.mixes[state]).rms);
    const explore = rms('explore');
    expect(explore).toBeGreaterThan(-30);
    expect(explore).toBeLessThan(-20);
    expect(rms('combat')).toBeGreaterThan(explore + 3);
    expect(rms('combat')).toBeLessThan(explore + 10);
    expect(rms('boss')).toBeGreaterThan(rms('combat') - 1);
    expect(rms('stealth')).toBeGreaterThan(explore - 5);
    expect(rms('talk')).toBeGreaterThan(explore - 5);
    expect(rms('discover')).toBeGreaterThan(explore);
    expect(rms('discover')).toBeLessThan(explore + 5);
  });
});
