import { describe, expect, it, vi } from 'vitest';
import { LIFT_ARRIVE_SOUND, LIFT_CALL_SOUND, LIFT_CUE_KEYS, LIFT_REFUSE_SOUND, LIFT_RIDE_SECONDS, LIFT_RIDE_SOUND, liftCueSamples, liftRideSamples, makeLiftCuePlayer, makeLiftRidePlayer } from './liftSound';

describe('the lift ride cue', () => {
  it('is deterministic, finite, within range and fades in and out', () => {
    const a = liftRideSamples(8000);
    const b = liftRideSamples(8000);
    expect(a.length).toBe(Math.round(LIFT_RIDE_SECONDS * 8000));
    expect(Array.from(a.slice(0, 200))).toEqual(Array.from(b.slice(0, 200)));
    let peak = 0;
    for (const v of a) {
      expect(Number.isFinite(v)).toBe(true);
      peak = Math.max(peak, Math.abs(v));
    }
    expect(peak).toBeGreaterThan(0.05);
    expect(peak).toBeLessThanOrEqual(1);
    expect(Math.abs(a[0])).toBeLessThan(0.01);
    expect(Math.abs(a[a.length - 1])).toBeLessThan(0.01);
  });

  it('registers once and plays on every ride, and never throws', () => {
    const audio = { register: vi.fn(), play: vi.fn(() => 1) };
    const play = makeLiftRidePlayer(audio);
    play();
    play();
    expect(audio.register).toHaveBeenCalledTimes(1);
    expect(audio.register.mock.calls[0][0]).toBe(LIFT_RIDE_SOUND);
    expect(audio.play).toHaveBeenCalledTimes(2);
    expect(() => makeLiftRidePlayer(undefined)()).not.toThrow();
    const broken = { register: vi.fn(() => { throw new Error('x'); }), play: vi.fn() };
    expect(() => makeLiftRidePlayer(broken)()).not.toThrow();
  });
});

describe('the lift one-shot cues', () => {
  it('has three distinct keys, none the ride key, each deterministic and audible', () => {
    expect(new Set([...LIFT_CUE_KEYS, LIFT_RIDE_SOUND]).size).toBe(4);
    for (const key of LIFT_CUE_KEYS) {
      const a = liftCueSamples(key);
      expect(Array.from(a.slice(0, 300))).toEqual(Array.from(liftCueSamples(key).slice(0, 300)));
      let peak = 0;
      for (const v of a) {
        expect(Number.isFinite(v)).toBe(true);
        peak = Math.max(peak, Math.abs(v));
      }
      expect(peak).toBeGreaterThan(0.05);
      expect(peak).toBeLessThanOrEqual(1);
    }
  });

  it('registers each key once and plays only the key asked for', () => {
    const audio = { register: vi.fn(), play: vi.fn((_key: string) => 1) };
    const play = makeLiftCuePlayer(audio);
    play(LIFT_REFUSE_SOUND);
    play(LIFT_REFUSE_SOUND);
    play(LIFT_ARRIVE_SOUND);
    expect(audio.register.mock.calls.map((c) => c[0])).toEqual([LIFT_REFUSE_SOUND, LIFT_ARRIVE_SOUND]);
    expect(audio.play.mock.calls.map((c) => c[0])).toEqual([LIFT_REFUSE_SOUND, LIFT_REFUSE_SOUND, LIFT_ARRIVE_SOUND]);
    expect(audio.play.mock.calls.flat()).not.toContain(LIFT_CALL_SOUND);
  });

  it('never throws without audio or with a broken service', () => {
    expect(() => makeLiftCuePlayer(undefined)(LIFT_CALL_SOUND)).not.toThrow();
    const broken = { register: vi.fn(() => { throw new Error('x'); }), play: vi.fn() };
    expect(() => makeLiftCuePlayer(broken)(LIFT_CALL_SOUND)).not.toThrow();
    expect(broken.play).not.toHaveBeenCalled();
  });
});
