import { describe, expect, it, vi } from 'vitest';
import { LIFT_RIDE_SECONDS, LIFT_RIDE_SOUND, liftRideSamples, makeLiftRidePlayer } from './liftSound';

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
