import { describe, expect, it } from 'vitest';
import { AuraWindow } from './AuraWindow';

describe('AuraWindow', () => {
  it('starts inactive', () => {
    const a = new AuraWindow(4);
    expect(a.active).toBe(false);
    expect(a.secondsLeft).toBe(0);
  });
  it('trigger starts it at full length', () => {
    const a = new AuraWindow(4);
    expect(a.trigger()).toBe('started');
    expect(a.active).toBe(true);
    expect(a.secondsLeft).toBe(4);
  });
  it('trigger while active refreshes back to full', () => {
    const a = new AuraWindow(4);
    a.trigger();
    a.tick(3);
    expect(a.secondsLeft).toBe(1);
    expect(a.trigger()).toBe('refreshed');
    expect(a.secondsLeft).toBe(4);
  });
  it('tick counts down and reports expiry exactly once', () => {
    const a = new AuraWindow(4);
    a.trigger();
    expect(a.tick(1)).toBe(false);
    expect(a.tick(1)).toBe(false);
    expect(a.tick(1)).toBe(false);
    expect(a.tick(1)).toBe(true);
    expect(a.active).toBe(false);
    expect(a.tick(1)).toBe(false);
    expect(a.tick(100)).toBe(false);
  });
  it('a tick that overshoots expires cleanly at zero', () => {
    const a = new AuraWindow(1);
    a.trigger();
    expect(a.tick(10)).toBe(true);
    expect(a.secondsLeft).toBe(0);
  });
  it('can be started again after it expired', () => {
    const a = new AuraWindow(1);
    a.trigger();
    a.tick(1);
    expect(a.trigger()).toBe('started');
    expect(a.active).toBe(true);
  });
  it('cancel mid-window returns true, deactivates, and does not then expire', () => {
    const a = new AuraWindow(4);
    a.trigger();
    a.tick(1);
    expect(a.cancel()).toBe(true);
    expect(a.active).toBe(false);
    expect(a.tick(10)).toBe(false);
  });
  it('cancel when inactive returns false', () => {
    const a = new AuraWindow(4);
    expect(a.cancel()).toBe(false);
    a.trigger();
    a.cancel();
    expect(a.cancel()).toBe(false);
  });
  it.each([0, -1, NaN])('constructor throws for seconds = %f', (s) => {
    expect(() => new AuraWindow(s)).toThrow();
  });
  it.each([0, -1, NaN])('tick(%f) is a no-op', (dt) => {
    const a = new AuraWindow(4);
    a.trigger();
    expect(a.tick(dt)).toBe(false);
    expect(a.secondsLeft).toBe(4);
  });
  it('tick on an inactive window is false', () => {
    expect(new AuraWindow(4).tick(1)).toBe(false);
  });
});
