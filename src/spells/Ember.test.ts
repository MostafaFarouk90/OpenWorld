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
  it('regen notifies at most once per displayed point; spend and restore always notify', () => {
    const e = new Ember();
    e.spend(40);
    const events: Array<[number, number]> = [];
    e.onChange = (v, p) => events.push([v, p]);
    const before = e.value;
    for (let i = 0; i < 60 * 20; i++) e.regen(1 / 60);
    const change = e.value - before;
    expect(change).toBeGreaterThan(30);
    expect(events.length).toBeLessThanOrEqual(Math.ceil(change) + 1);
    const n = events.length;
    e.spend(0.2);
    e.restore(0.2);
    expect(events.length).toBe(n + 2);
  });
});

describe('Ember boundary notifications', () => {
  it('regen reports the final full value', () => {
    const e = new Ember();
    e.spend(0.4);
    const seen: number[] = [];
    e.onChange = (v) => seen.push(v);
    for (let i = 0; i < 600; i++) e.regen(1 / 60);
    expect(e.value).toBe(e.max);
    expect(seen[seen.length - 1]).toBe(e.max);
  });
});

describe('Ember.setMax (class rows)', () => {
  it('keeps the value, clamps it to a lower maximum and notifies', () => {
    const e = new Ember();
    const seen: number[] = [];
    e.onChange = (v) => seen.push(v);
    expect(e.setMax(60)).toBe(true);
    expect(e.max).toBe(60);
    expect(e.value).toBe(60);
    expect(seen).toEqual([60]);
  });
  it('a larger maximum keeps the value and regenerates up to it', () => {
    const e = new Ember();
    e.setMax(160);
    expect(e.value).toBe(100);
    for (let i = 0; i < 60 * 40; i++) e.regen(1 / 60);
    expect(e.value).toBe(160);
  });
  it.each([0, -5, Number.NaN, Number.POSITIVE_INFINITY, '30' as unknown as number])('refuses %s and changes nothing', (n) => {
    const e = new Ember();
    expect(e.setMax(n)).toBe(false);
    expect(e.max).toBe(100);
  });
  it('a save carries its maximum, so a value above the default survives the load; a bad saved maximum is ignored', () => {
    const e = new Ember();
    e.setMax(150);
    e.restore(50);
    const saved = e.serialize();
    expect(saved).toEqual({ ember: 150, max: 150 });
    const fresh = new Ember();
    fresh.load(saved, 1);
    expect(fresh.value).toBe(150);
    expect(fresh.max).toBe(150);
    fresh.setMax(120);
    expect(fresh.value).toBe(120);
    const bad = new Ember();
    bad.load({ ember: 500, max: -3 }, 1);
    expect([bad.max, bad.value]).toEqual([100, 100]);
    bad.load({ ember: 50, max: 99999 }, 1);
    expect(bad.max).toBe(100);
  });
  it('spending and the full-value notification use the class maximum', () => {
    const e = new Ember();
    e.setMax(50);
    e.spend(10);
    const seen: number[] = [];
    e.onChange = (v) => seen.push(v);
    for (let i = 0; i < 60 * 10; i++) e.regen(1 / 60);
    expect(e.value).toBe(50);
    expect(seen[seen.length - 1]).toBe(50);
  });
});
