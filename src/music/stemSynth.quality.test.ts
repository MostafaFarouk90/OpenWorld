import { describe, expect, it } from 'vitest';
import { synthStem } from './stemSynth';
import { ASH_ON_THE_PASTURE, BARLEY_AND_BRAZIER, HAMMERS_BELOW, SEVEN_GATES_ONE_DRUM, loopSamples, type TrackDef } from './tracks';

// What makes the stems sound played rather than triggered (music-quality plan): hits differ in
// level, off-beats wander a few milliseconds while the quarter notes stay on the grid, phrases do
// not repeat bar for bar, and the pad follows the chords.

const SR = 8000;
const TRACKS: TrackDef[] = [BARLEY_AND_BRAZIER, SEVEN_GATES_ONE_DRUM, ASH_ON_THE_PASTURE, HAMMERS_BELOW];

const stepSamples = (t: TrackDef): number => loopSamples(t, SR) / t.bars / 16;
const tokens = (bar: string): string[] => bar.trim().split(/\s+/);

/** Index of the first sample in [from, to) louder than `frac` of the window's peak. */
function onset(x: Float32Array, from: number, to: number, frac = 0.2): number {
  let peak = 0;
  for (let i = from; i < to; i++) peak = Math.max(peak, Math.abs(x[i]));
  for (let i = from; i < to; i++) if (Math.abs(x[i]) >= frac * peak) return i;
  return from;
}

function windowPeak(x: Float32Array, from: number, to: number): number {
  let peak = 0;
  for (let i = Math.max(0, from); i < Math.min(x.length, to); i++) peak = Math.max(peak, Math.abs(x[i]));
  return peak;
}

function goertzel(x: Float32Array, from: number, to: number, hz: number): number {
  const w = (2 * Math.PI * hz) / SR;
  const c = 2 * Math.cos(w);
  let s1 = 0;
  let s2 = 0;
  for (let i = from; i < to; i++) {
    const s0 = x[i] + c * s1 - s2;
    s2 = s1;
    s1 = s0;
  }
  return Math.sqrt(s1 * s1 + s2 * s2 - c * s1 * s2) / (to - from);
}

describe.each(TRACKS)('$id drums feel played', (track) => {
  const step = stepSamples(track);
  const kick = synthStem(track, 'kick', SR);

  const kickSteps: Array<[number, number]> = [];
  for (let bar = 0; bar < track.bars; bar++) {
    tokens(track.synth?.pattern[bar % 2] ?? '').forEach((tok, s) => {
      if (tok === 'B') kickSteps.push([bar, s]);
    });
  }

  it('kick hits differ in level (no two-bar loop of identical hits)', () => {
    const peaks = kickSteps.map(([bar, s]) => {
      const at = Math.round((bar * 16 + s) * step);
      return Math.round(windowPeak(kick, at, at + step * 3) * 200);
    });
    expect(new Set(peaks).size).toBeGreaterThanOrEqual(6);
  });

  it('quarter-note kicks stay on the grid: the same offset every time, within 1.5 ms', () => {
    // The loudest sample of a thump lands a fixed few milliseconds after its start, so on-grid hits
    // all show the same offset; looseness would spread them.
    const offsets = kickSteps
      .filter(([, s]) => s % 4 === 0)
      .map(([bar, s]) => {
        const at = Math.round((bar * 16 + s) * step);
        let best = at;
        for (let i = at; i < at + Math.round(0.03 * SR); i++) if (Math.abs(kick[i % kick.length]) > Math.abs(kick[best % kick.length])) best = i;
        return best - at;
      });
    expect((Math.max(...offsets) - Math.min(...offsets)) / SR).toBeLessThan(0.0015);
  });

  it('off-beat hat ticks wander: their onsets are not all the same distance from the grid', () => {
    const hat = synthStem(track, 'hat', SR);
    const lags = new Set<number>();
    for (let bar = 0; bar < track.bars; bar++) {
      tokens(track.synth?.pattern[bar % 2] ?? '').forEach((tok, s) => {
        if (tok !== 't' || s % 4 === 0) return;
        const at = Math.round((bar * 16 + s) * step);
        lags.add(onset(hat, at - Math.round(step * 0.45), at + Math.round(step * 0.9), 0.3) - at);
      });
    }
    expect(lags.size).toBeGreaterThanOrEqual(4);
  });

  for (const id of track.stems.filter((s) => s !== 'boss')) {
    it(`${id} builds and breathes: its bars do not all have the same energy`, () => {
      const x = synthStem(track, id, SR);
      const bar = Math.floor(loopSamples(track, SR) / track.bars);
      const rmsOf = (from: number, to: number): number => {
        let sq = 0;
        for (let i = from; i < to; i++) sq += x[i] ** 2;
        return Math.sqrt(sq / (to - from));
      };
      const overall = rmsOf(0, x.length);
      const levels = new Set<number>();
      for (let b = 0; b < track.bars; b++) levels.add(Math.round((rmsOf(b * bar, (b + 1) * bar) / overall) * 50)); // 2% steps
      // A drum machine looping two bars gives two values; a phrase with an arc gives many.
      expect(levels.size).toBeGreaterThanOrEqual(5);
    });
  }
});

describe('Barley and Brazier harmony', () => {
  const vocal = synthStem(BARLEY_AND_BRAZIER, 'vocal', SR);
  const bar = Math.floor(loopSamples(BARLEY_AND_BRAZIER, SR) / 16);
  // Bars 0 and 1 are Dm and Bb: A3 (220 Hz) belongs to the first, Bb3 (233 Hz) to the second.
  it('the pad and lute move with the chords', () => {
    const w = (b: number, hz: number): number => goertzel(vocal, b * bar + Math.floor(bar * 0.3), b * bar + Math.floor(bar * 0.9), hz);
    expect(w(0, 220)).toBeGreaterThan(1.5 * w(1, 220));
    expect(w(1, 233.08)).toBeGreaterThan(1.5 * w(0, 233.08));
  });
});

describe('stability across sample rates', () => {
  const finiteAt = (track: TrackDef, rate: number): void => {
    for (const id of track.stems) {
      const x = synthStem(track, id, rate);
      let finite = true;
      let peak = 0;
      for (const v of x) {
        if (!Number.isFinite(v)) finite = false;
        peak = Math.max(peak, Math.abs(v));
      }
      expect(finite, `${track.id} ${id} at ${rate}`).toBe(true);
      expect(peak, `${track.id} ${id} at ${rate}`).toBeGreaterThan(0);
    }
  };
  it.each([8000, 22050, 44100])('every Barley stem is finite at %d Hz', (rate) => finiteAt(BARLEY_AND_BRAZIER, rate));
  it('every Seven Gates stem is finite at 22.05 kHz', () => finiteAt(SEVEN_GATES_ONE_DRUM, 22050));
  it.each([ASH_ON_THE_PASTURE, HAMMERS_BELOW])('every $id stem is finite at 8 and 22.05 kHz', (track) => {
    finiteAt(track, 8000);
    finiteAt(track, 22050);
  });
});
