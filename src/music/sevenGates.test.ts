import { describe, expect, it } from 'vitest';
import { STEM_PEAK, synthStem } from './stemSynth';
import { BARLEY_AND_BRAZIER, SEVEN_GATES_ONE_DRUM, TRACKS_BY_ID, loopSamples, loopSeconds, validateTrack, type TrackDef } from './tracks';

const SR = 8000;
const T = SEVEN_GATES_ONE_DRUM;
const L = loopSamples(T, SR);
const PEAK_LIMIT = STEM_PEAK;

const render = (track: TrackDef): Record<string, Float32Array> =>
  Object.fromEntries(track.stems.map((id) => [id, synthStem(track, id, SR)]));

const peakOf = (a: Float32Array): number => a.reduce((m, x) => Math.max(m, Math.abs(x)), 0);

describe('Seven Gates, One Drum', () => {
  const stems = render(T);

  it('validates and is registered', () => {
    expect(() => validateTrack(T)).not.toThrow();
    expect(TRACKS_BY_ID['seven-gates-one-drum']).toBe(T);
    expect(TRACKS_BY_ID['barley-and-brazier']).toBe(BARLEY_AND_BRAZIER);
    for (const mix of Object.values(T.mixes)) expect(Object.keys(mix).sort()).toEqual([...T.stems].sort());
  });

  it('has a 2.5 s bar at 96 BPM and a 40 s loop', () => {
    expect(loopSeconds({ bars: 1, bpm: T.bpm }, SR)).toBeCloseTo(2.5, 6);
    expect(loopSeconds(T, SR)).toBeCloseTo(40, 6);
  });

  for (const id of T.stems) {
    describe(id, () => {
      const a = stems[id];
      it('is exact length, finite, non-silent and peak-limited', () => {
        expect(a.length).toBe(L);
        expect(a.every(Number.isFinite)).toBe(true);
        expect(peakOf(a)).toBeGreaterThan(0.05);
        expect(peakOf(a)).toBeLessThanOrEqual(PEAK_LIMIT[id] + 1e-6);
      });
      it('is deterministic', () => {
        expect(synthStem(T, id, SR)).toEqual(a);
      });
      it('differs from the Barley stem', () => {
        expect(synthStem(BARLEY_AND_BRAZIER, id, SR)).not.toEqual(a);
      });
      it('wraps continuously at the loop seam', () => {
        let maxStep = 0;
        for (let i = 1; i < a.length; i++) maxStep = Math.max(maxStep, Math.abs(a[i] - a[i - 1]));
        expect(Math.abs(a[0] - a[a.length - 1])).toBeLessThanOrEqual(Math.max(maxStep, 0.05 * peakOf(a)));
      });
    });
  }

  it('summed combat and boss mixes stay under full scale for both tracks', () => {
    for (const track of [BARLEY_AND_BRAZIER, T]) {
      const s = render(track);
      for (const state of ['combat', 'boss'] as const) {
        const mix = track.mixes[state];
        const sum = new Float32Array(loopSamples(track, SR));
        for (const id of track.stems) {
          const g = mix[id] ?? 0;
          for (let i = 0; i < sum.length; i++) sum[i] += s[id][i] * g;
        }
        expect(peakOf(sum), `${track.id} ${state}`).toBeLessThan(1);
      }
    }
  });

  it('places kicks on the beatbox pattern steps', () => {
    const kick = stems.kick;
    const step = L / T.bars / 16;
    const energy = (from: number, n: number): number => {
      let e = 0;
      for (let i = from; i < from + n; i++) e += Math.abs(kick[i % L]);
      return e;
    };
    const window = Math.floor(step / 2);
    expect(energy(0, window)).toBeGreaterThan(1);
    expect(energy(Math.round(step), window)).toBeGreaterThan(0); // kick tail rings
    // Step 1 of bar 1 is a rest: only the decaying tail of step 0 is there, far below a fresh hit.
    expect(energy(Math.round(step), window)).toBeLessThan(energy(0, window) * 0.5);
    // Step 8 of bar 1 is a kick again.
    expect(energy(Math.round(step * 8), window)).toBeGreaterThan(energy(Math.round(step), window) * 2);
  });
});
