import { describe, expect, it } from 'vitest';
import { AdaptiveBeatClock } from './beat';

const PERIOD = 60000 / 94;
const metronome = (divisions?: number) => new AdaptiveBeatClock({ beat: () => null, toAudioTime: () => undefined, nowMs: () => 1000 }, 94, divisions);

describe('AdaptiveBeatClock divisions', () => {
  it('defaults to one step per beat', () => {
    const c = metronome();
    expect(c.locate(1000 + PERIOD * 3 + 5)).toMatchObject({ index: 3 });
    expect(c.locate(1000 + PERIOD * 3 + 5).errorMs).toBeCloseTo(5, 5);
    expect(metronome(1).locate(1000 + PERIOD).index).toBe(1);
  });
  it('divides the metronome period', () => {
    const c = metronome(4);
    expect(c.locate(1000 + PERIOD).index).toBe(4);
    expect(c.locate(1000 + PERIOD / 4 + 3)).toMatchObject({ index: 1 });
    // The window of step 1 closes 100 ms after it.
    expect(c.passedIndex(1000 + PERIOD / 4 + 99, 100)).toBe(0);
    expect(c.passedIndex(1000 + PERIOD / 4 + 101, 100)).toBe(1);
  });
  it('divides the music grid and keeps it through a re-read', () => {
    let info: { beatSeconds: number; nextBeatTime: number } | null = { beatSeconds: 60 / 94, nextBeatTime: 10 };
    const c = new AdaptiveBeatClock({ beat: () => info, toAudioTime: (ms) => ms / 1000, nowMs: () => 0 }, 94, 4);
    expect(c.source()).toBe('music');
    const gen = c.generation();
    expect(c.locate(10_000 + PERIOD).index).toBe(4);
    info = { beatSeconds: 60 / 94, nextBeatTime: 10 + (60 / 94) * 3 }; // same grid, later beat: no re-base
    expect(c.generation()).toBe(gen);
    expect(c.locate(10_000 + PERIOD).index).toBe(4);
    info = null;
    expect(c.source()).toBe('metronome');
  });
  it('reads a bad divisions value as 1', () => {
    for (const d of [0, -2, 2.5, NaN]) expect(metronome(d).locate(1000 + PERIOD).index).toBe(1);
  });
});
