import { describe, expect, it } from 'vitest';
import { FIXED_TIMESTEP } from '../config/constants';
import { Clock, MAX_HIT_STOP } from './Clock';

describe('Clock', () => {
  it('starts at tick 0 and counts simulated ticks', () => {
    const c = new Clock(0.5);
    expect(c.tick).toBe(0);
    expect(c.seconds).toBe(0);
    expect(c.beginTick()).toBe(true);
    expect(c.beginTick()).toBe(true);
    expect(c.tick).toBe(2);
    expect(c.seconds).toBe(1);
  });

  it('defaults to the fixed timestep', () => {
    const c = new Clock();
    c.beginTick();
    expect(c.seconds).toBeCloseTo(FIXED_TIMESTEP, 12);
  });

  it('hit-stop skips ticks, then resumes', () => {
    const c = new Clock(0.05);
    c.hitStop(0.1);
    expect(c.hitStopRemaining).toBeCloseTo(0.1);
    expect(c.beginTick()).toBe(false);
    expect(c.beginTick()).toBe(false);
    expect(c.hitStopRemaining).toBe(0);
    expect(c.tick).toBe(0);
    expect(c.beginTick()).toBe(true);
    expect(c.tick).toBe(1);
  });

  it('float residue after countdown ends hit-stop exactly', () => {
    const c = new Clock(FIXED_TIMESTEP);
    c.hitStop(FIXED_TIMESTEP * 3);
    let skipped = 0;
    while (!c.beginTick()) skipped++;
    expect(skipped).toBe(3);
    expect(c.hitStopRemaining).toBe(0);
  });

  it('overlapping hit-stops keep the longest', () => {
    const c = new Clock(0.01);
    c.hitStop(0.1);
    c.hitStop(0.05);
    expect(c.hitStopRemaining).toBeCloseTo(0.1);
    c.hitStop(0.15);
    expect(c.hitStopRemaining).toBeCloseTo(0.15);
  });

  it('caps hit-stop at MAX_HIT_STOP (0.2 s)', () => {
    const c = new Clock();
    expect(MAX_HIT_STOP).toBe(0.2);
    c.hitStop(5);
    expect(c.hitStopRemaining).toBe(0.2);
  });

  it('ignores negative, zero, NaN and infinite hit-stops', () => {
    const c = new Clock();
    for (const v of [-1, 0, NaN, Infinity, -Infinity]) c.hitStop(v);
    expect(c.hitStopRemaining).toBe(0);
    expect(c.beginTick()).toBe(true);
  });

  it('pause skips ticks without counting down hit-stop', () => {
    const c = new Clock(0.05);
    c.hitStop(0.1);
    c.setPaused('menu', true);
    expect(c.paused).toBe(true);
    expect(c.beginTick()).toBe(false);
    expect(c.hitStopRemaining).toBeCloseTo(0.1);
    c.setPaused('menu', false);
    expect(c.paused).toBe(false);
    expect(c.beginTick()).toBe(false);
    expect(c.hitStopRemaining).toBeCloseTo(0.05);
  });

  it('pause reasons stack: one cleared reason stays paused', () => {
    const c = new Clock();
    c.setPaused('menu', true);
    c.setPaused('dialogue', true);
    c.setPaused('menu', false);
    expect(c.paused).toBe(true);
    expect(c.beginTick()).toBe(false);
    c.setPaused('dialogue', false);
    expect(c.paused).toBe(false);
    expect(c.beginTick()).toBe(true);
  });

  it('setting the same reason twice counts once; clearing an unknown reason is a no-op', () => {
    const c = new Clock();
    c.setPaused('a', true);
    c.setPaused('a', true);
    c.setPaused('a', false);
    expect(c.paused).toBe(false);
    c.setPaused('never', false);
    expect(c.paused).toBe(false);
  });
});
