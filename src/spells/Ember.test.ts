import { describe, expect, it, vi } from 'vitest';
import { EMBER } from '../vfx/tuning';
import { Ember } from './Ember';

describe('Ember', () => {
  it('starts full and spends', () => {
    const e = new Ember();
    expect(e.value).toBe(EMBER.start);
    expect(e.spend(40)).toBe(true);
    expect(e.value).toBe(60);
  });
  it('insufficient spends nothing', () => {
    const e = new Ember();
    e.spend(90);
    const cb = vi.fn();
    e.onChange = cb;
    expect(e.spend(11)).toBe(false);
    expect(e.value).toBe(10);
    expect(cb).not.toHaveBeenCalled();
  });
  it('n<=0 is a successful no-op and NaN fails', () => {
    const e = new Ember();
    expect(e.spend(0)).toBe(true);
    expect(e.spend(-5)).toBe(true);
    expect(e.spend(Number.NaN)).toBe(false);
    expect(e.value).toBe(EMBER.max);
  });
  it('restore clamps and ignores bad input', () => {
    const e = new Ember();
    e.spend(30);
    e.restore(Number.NaN);
    e.restore(-4);
    expect(e.value).toBe(70);
    e.restore(1000);
    expect(e.value).toBe(EMBER.max);
  });
  it('regens only after the delay', () => {
    const e = new Ember();
    e.spend(50);
    e.regen(EMBER.regenDelayAfterSpendSeconds - 0.01);
    expect(e.value).toBe(50);
    e.regen(1.01);
    expect(e.value).toBeCloseTo(50 + EMBER.regenPerSecond * 1);
    e.regen(1);
    expect(e.value).toBeCloseTo(50 + EMBER.regenPerSecond * 2);
  });
  it('a new spend restarts the delay and onChange fires only on change', () => {
    const e = new Ember();
    const cb = vi.fn();
    e.onChange = cb;
    e.regen(10);
    expect(cb).not.toHaveBeenCalled();
    e.spend(10);
    e.regen(3);
    e.spend(10);
    const v = e.value;
    e.regen(1);
    expect(e.value).toBe(v);
  });
  it('persists and rejects bad data', () => {
    const e = new Ember();
    e.spend(25);
    const f = new Ember();
    f.load(e.serialize(), 1);
    expect(f.value).toBe(75);
    f.load({ ember: 'x' }, 1);
    f.load({ ember: 5 }, 9);
    f.load(null, 1);
    expect(f.value).toBe(75);
    f.load({ ember: 9999 }, 1);
    expect(f.value).toBe(EMBER.max);
    expect(f.key).toBe('ember');
  });
});
