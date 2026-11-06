import { describe, expect, it } from 'vitest';
import { WeatherClock, cycleLengths, nextChange, phaseAt } from './clock';
import { STORM_CLOCK } from './tuning';

describe('storm clock', () => {
  it('gives the same schedule for the same seed over 100 cycles', () => {
    for (let n = 0; n < 100; n++) expect(cycleLengths(4042, n)).toEqual(cycleLengths(4042, n));
    const a = Array.from({ length: 50 }, (_, i) => phaseAt(4042, i * 97.3).kind);
    const b = Array.from({ length: 50 }, (_, i) => phaseAt(4042, i * 97.3).kind);
    expect(a).toEqual(b);
  });

  it('differs for a different seed', () => {
    const a = Array.from({ length: 20 }, (_, n) => cycleLengths(4042, n).clear);
    const b = Array.from({ length: 20 }, (_, n) => cycleLengths(7, n).clear);
    expect(a).not.toEqual(b);
  });

  it('keeps every phase inside its length and jitter, and contiguous', () => {
    let t = 0;
    for (let n = 0; n < 100; n++) {
      const l = cycleLengths(4042, n);
      expect(Math.abs(l.clear - STORM_CLOCK.clear)).toBeLessThanOrEqual(STORM_CLOCK.clearJitter);
      expect(Math.abs(l.storm - STORM_CLOCK.storm)).toBeLessThanOrEqual(STORM_CLOCK.stormJitter);
      expect(l.warning).toBe(STORM_CLOCK.warning);
      const c = phaseAt(4042, t);
      expect(c).toMatchObject({ kind: 'clear', cycle: n, t: 0 });
      const w = phaseAt(4042, c.endsAt);
      expect(w).toMatchObject({ kind: 'warning', cycle: n, startsAt: c.endsAt });
      const s = phaseAt(4042, w.endsAt);
      expect(s).toMatchObject({ kind: 'storm', cycle: n, startsAt: w.endsAt });
      expect(s.endsAt - s.startsAt).toBeCloseTo(l.storm, 6);
      t = s.endsAt;
    }
  });

  it('starts clear at t 0 and treats bad times as 0', () => {
    expect(phaseAt(1, 0).kind).toBe('clear');
    expect(phaseAt(1, -5)).toEqual(phaseAt(1, 0));
    expect(phaseAt(1, Number.NaN)).toEqual(phaseAt(1, 0));
  });

  it('names the next change', () => {
    const c = phaseAt(4042, 10);
    expect(nextChange(4042, 10)).toEqual({ kind: 'warning', at: c.endsAt });
    expect(nextChange(4042, c.endsAt).kind).toBe('storm');
    expect(nextChange(4042, phaseAt(4042, c.endsAt).endsAt).kind).toBe('clear');
  });

  it('holds the end of a clear phase and of a warning while a dialogue runs, never a running storm', () => {
    const clock = new WeatherClock(4042);
    const clearEnd = clock.phase().endsAt;
    clock.advance(clearEnd + 50, true);
    expect(clock.phase().kind).toBe('clear');
    expect(clock.t).toBeLessThan(clearEnd);
    clock.advance(1); // the talk ends
    expect(clock.phase().kind).toBe('warning');
    const warnEnd = clock.phase().endsAt;
    clock.advance(100, true);
    expect(clock.phase().kind).toBe('warning');
    expect(clock.t).toBeLessThan(warnEnd);
    clock.advance(1);
    expect(clock.phase().kind).toBe('storm');
    const t = clock.t;
    clock.advance(5, true);
    expect(clock.t).toBeCloseTo(t + 5, 9);
  });

  it('ignores bad steps and restores saved values', () => {
    const clock = new WeatherClock(4042);
    clock.advance(-1);
    clock.advance(Number.NaN);
    expect(clock.t).toBe(0);
    clock.restore(9, 123);
    expect(clock).toMatchObject({ seed: 9, t: 123 });
    clock.restore(Number.NaN, -4);
    expect(clock).toMatchObject({ seed: 9, t: 0 });
  });
});
