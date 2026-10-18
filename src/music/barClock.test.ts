import { describe, expect, it } from 'vitest';
import { BarClock } from './barClock';

// 16 bars over 32 s: 2 s per bar, started at t=10.
const clock = () => new BarClock(10, 32, 16);

describe('BarClock', () => {
  it('computes barSeconds', () => {
    expect(clock().barSeconds).toBe(2);
  });
  it('position is 0 before and at the start', () => {
    expect(clock().position(0)).toBe(0);
    expect(clock().position(10)).toBe(0);
  });
  it('position advances and wraps at the loop', () => {
    const c = clock();
    expect(c.position(13)).toBeCloseTo(1.5, 12);
    expect(c.position(10 + 32)).toBeCloseTo(0, 9);
    expect(c.position(10 + 32 + 3)).toBeCloseTo(1.5, 9);
    expect(c.position(10 + 31.9)).toBeLessThan(16);
  });
  it('nextBar exactly on a boundary returns that boundary', () => {
    const c = clock();
    expect(c.nextBar(10 + 6)).toBe(3);
    expect(c.nextBar(10 + 6 + 1e-9)).toBe(3);
  });
  it('nextBar rounds up mid-bar and may equal bars', () => {
    const c = clock();
    expect(c.nextBar(10 + 6.5)).toBe(4);
    expect(c.nextBar(10 + 31)).toBe(16);
  });
  it('nextHalf at 0/8/16', () => {
    const c = clock();
    expect(c.nextHalf(5) + 0).toBe(0); // may be -0
    expect(c.nextHalf(10 + 1)).toBe(8);
    expect(c.nextHalf(10 + 16)).toBe(8);
    expect(c.nextHalf(10 + 17)).toBe(16);
  });
  it('halfAfter is strictly after', () => {
    const c = clock();
    expect(c.halfAfter(0)).toBe(8);
    expect(c.halfAfter(8)).toBe(16);
    expect(c.halfAfter(16)).toBe(24);
    expect(c.halfAfter(7.5)).toBe(8);
  });
  it('timeAtBarPosition is linear', () => {
    const c = clock();
    const now = 13; // position 1.5
    expect(c.timeAtBarPosition(now, 1.5)).toBeCloseTo(13, 12);
    expect(c.timeAtBarPosition(now, 3.5)).toBeCloseTo(17, 12);
    expect(c.timeAtBarPosition(now, 16)).toBeCloseTo(13 + 14.5 * 2, 12);
    const a = c.timeAtBarPosition(now, 4);
    const b = c.timeAtBarPosition(now, 6);
    const e = c.timeAtBarPosition(now, 8);
    expect(e - b).toBeCloseTo(b - a, 12);
  });
  it.each([
    [0, 16],
    [-1, 16],
    [NaN, 16],
    [32, 0],
    [32, -4],
    [32, NaN],
  ])('rejects loop %s / bars %s', (loop, bars) => {
    expect(() => new BarClock(0, loop, bars)).toThrow();
  });
});
