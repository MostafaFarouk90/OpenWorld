import { describe, expect, it, vi } from 'vitest';
import { BarClock } from './barClock';
import { BeatScheduler, beatInfoAt, beatInfoAtIndex, performanceToAudioTime } from './beatClock';
import { BARLEY_AND_BRAZIER as TRACK, loopSeconds } from './tracks';

const LOOP = loopSeconds(TRACK, 48000);
const BAR = LOOP / 16;
const BEAT = BAR / 4;
const T0 = 0.05;
const clock = new BarClock(T0, LOOP, 16);

describe('beatInfoAt', () => {
  it('before the start time sits at beat 0 and the next beat is the start', () => {
    const b = beatInfoAt(clock, TRACK.bpm, 0);
    expect(b).toMatchObject({ bar: 0, beat: 0, step: 0, phase: 0, nextBeatTime: T0, audioTime: T0 });
  });

  it('knows the 92 BPM beat length', () => {
    expect(BEAT).toBeCloseTo(60 / 92, 2);
    expect(beatInfoAt(clock, 92, T0 + 1).beatSeconds).toBeCloseTo(BEAT, 9);
  });

  it('reports bar, beat, step and phase mid-beat', () => {
    const b = beatInfoAt(clock, TRACK.bpm, T0 + BAR * 2 + BEAT * 1.5);
    expect(b.bar).toBe(2);
    expect(b.beat).toBe(1);
    expect(b.step).toBe(6);
    expect(b.phase).toBeCloseTo(0.5, 6);
    expect(b.audioTime).toBeCloseTo(T0 + BAR * 2 + BEAT, 9);
    expect(b.nextBeatTime).toBeCloseTo(T0 + BAR * 2 + BEAT * 2, 9);
  });

  it('is exactly on the line when now equals a beat time (no off-by-one)', () => {
    for (let i = 0; i < 40; i++) {
      const b = beatInfoAt(clock, TRACK.bpm, T0 + i * BEAT);
      expect(b.beat).toBe(i % 4);
      expect(b.bar).toBe(Math.floor(i / 4));
      expect(b.step % 4).toBe(0);
    }
  });

  it('the bar counter keeps counting past the 16-bar loop', () => {
    expect(beatInfoAt(clock, TRACK.bpm, T0 + BAR * 37.1).bar).toBe(37);
  });

  it('nextBeatTime is strictly ahead and monotonic', () => {
    let prev = -Infinity;
    for (let t = T0; t < T0 + 10; t += 0.013) {
      const b = beatInfoAt(clock, TRACK.bpm, t);
      expect(b.nextBeatTime).toBeGreaterThan(t - 1e-9);
      expect(b.nextBeatTime).toBeGreaterThanOrEqual(prev);
      prev = b.nextBeatTime;
    }
  });

  it('works at 96 BPM (Harrowmark)', () => {
    const c96 = new BarClock(0, 40, 16);
    expect(beatInfoAt(c96, 96, 2.5).bar).toBe(1);
    expect(beatInfoAt(c96, 96, 2.5).beatSeconds).toBeCloseTo(0.625, 9);
  });

  it('beatInfoAtIndex matches beatInfoAt', () => {
    expect(beatInfoAtIndex(clock, TRACK.bpm, 9)).toMatchObject({ bar: 2, beat: 1 });
  });
});

describe('BeatScheduler', () => {
  const collect = (s: BeatScheduler): number[] => {
    const out: number[] = [];
    s.onBeat((b) => out.push(b.bar * 4 + b.beat));
    return out;
  };

  it('emits each beat once, slightly ahead of time, across many ticks', () => {
    const s = new BeatScheduler();
    const got = collect(s);
    for (let t = 0; t < T0 + BEAT * 8; t += 1 / 60) s.update(clock, TRACK.bpm, t);
    expect(got.slice(0, 8)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(new Set(got).size).toBe(got.length);
  });

  it('delivers a beat before its audio time (look-ahead) and carries the beat time', () => {
    const s = new BeatScheduler({ lookaheadSeconds: 0.12 });
    const times: Array<{ at: number; audioTime: number }> = [];
    let now = 0;
    s.onBeat((b) => times.push({ at: now, audioTime: b.audioTime }));
    for (now = 0; now < 3; now += 1 / 60) s.update(clock, TRACK.bpm, now);
    for (const t of times) expect(t.at).toBeLessThanOrEqual(t.audioTime + 1 / 60 + 1e-9);
    expect(times.length).toBeGreaterThan(3);
  });

  it('a 10 s stall delivers at most one stale-free callback', () => {
    const s = new BeatScheduler();
    const got = collect(s);
    s.update(clock, TRACK.bpm, T0 + 1);
    const before = got.length;
    s.update(clock, TRACK.bpm, T0 + 11); // unpause after a stall
    expect(got.length - before).toBeLessThanOrEqual(1);
  });

  it('never emits more than the cap in one update, and does not replay the rest', () => {
    const s = new BeatScheduler({ staleBeats: 1000, maxPerUpdate: 8 });
    const got = collect(s);
    s.update(clock, TRACK.bpm, T0 + 30);
    expect(got.length).toBe(8);
    const n = got.length;
    s.update(clock, TRACK.bpm, T0 + 30.001);
    expect(got.length - n).toBeLessThanOrEqual(1);
  });

  it('isolates a throwing callback, warning once, and still calls the others', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const s = new BeatScheduler();
    s.onBeat(() => {
      throw new Error('boom');
    });
    const good = vi.fn();
    s.onBeat(good);
    for (let t = 0; t < 3; t += 1 / 60) s.update(clock, TRACK.bpm, t);
    expect(good.mock.calls.length).toBeGreaterThan(2);
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });

  it('a callback may unsubscribe another (or itself) mid-dispatch', () => {
    const s = new BeatScheduler();
    const second = vi.fn();
    let off2 = (): void => {};
    s.onBeat(() => off2());
    off2 = s.onBeat(second);
    s.update(clock, TRACK.bpm, T0 + 0.01);
    expect(second).not.toHaveBeenCalled();
    expect(s.listenerCount).toBe(1);
  });

  it('does nothing without a clock, without listeners, or with a non-finite time', () => {
    const s = new BeatScheduler();
    const got = collect(s);
    s.update(null, TRACK.bpm, 1);
    s.update(clock, TRACK.bpm, NaN);
    expect(got).toEqual([]);
    expect(() => new BeatScheduler().update(clock, TRACK.bpm, 5)).not.toThrow();
  });

  it('reset allows the same beat indices again', () => {
    const s = new BeatScheduler();
    const got = collect(s);
    s.update(clock, TRACK.bpm, T0 + 0.01);
    s.reset();
    s.update(clock, TRACK.bpm, T0 + 0.01);
    expect(got.filter((i) => i === 0)).toHaveLength(2);
  });
});

describe('performanceToAudioTime', () => {
  it('uses the context timestamp pairing when it is usable', () => {
    const ctx = { currentTime: 99, getOutputTimestamp: () => ({ contextTime: 10, performanceTime: 5000 }) };
    expect(performanceToAudioTime(ctx, 5250, 123456)).toBeCloseTo(10.25, 9);
  });

  it.each([
    ['zero timestamps', { contextTime: 0, performanceTime: 0 }],
    ['NaN timestamps', { contextTime: NaN, performanceTime: NaN }],
    ['missing fields', {}],
  ])('falls back to extrapolation on %s, minus the output latency', (_n, stamp) => {
    const ctx = { currentTime: 20, outputLatency: 0.04, getOutputTimestamp: () => stamp };
    expect(performanceToAudioTime(ctx, 1000, 1500)).toBeCloseTo(20 - 0.5 - 0.04, 9);
  });

  it('falls back when getOutputTimestamp is missing or throws, using baseLatency if no output latency', () => {
    expect(performanceToAudioTime({ currentTime: 5, baseLatency: 0.01 }, 1000, 1000)).toBeCloseTo(4.99, 9);
    const throwing = { currentTime: 5, getOutputTimestamp: () => { throw new Error('x'); } };
    expect(performanceToAudioTime(throwing, 1000, 1000)).toBeCloseTo(5, 9);
  });

  it('applies the calibration offset and ignores a nonsense latency', () => {
    expect(performanceToAudioTime({ currentTime: 5, outputLatency: NaN }, 0, 0, 0.02)).toBeCloseTo(5.02, 9);
  });
});
