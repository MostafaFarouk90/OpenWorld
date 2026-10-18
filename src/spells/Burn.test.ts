import { describe, expect, it, vi } from 'vitest';
import { Burn } from './Burn';

describe('Burn', () => {
  it('clamps to 0..100', () => {
    const b = new Burn();
    b.add(250, 't');
    expect(b.value).toBe(100);
    b.add(-500, 't');
    expect(b.value).toBe(0);
  });
  it('ignores NaN adds', () => {
    const b = new Burn();
    b.add(Number.NaN, 't');
    expect(b.value).toBe(0);
  });
  it('decays only out of combat', () => {
    const b = new Burn();
    b.add(50, 't');
    b.decay(5, true);
    expect(b.value).toBe(50);
    b.decay(5, false);
    expect(b.value).toBeCloseTo(49);
  });
  it('ignores NaN, zero and negative dt', () => {
    const b = new Burn();
    b.add(50, 't');
    b.decay(Number.NaN, false);
    b.decay(0, false);
    b.decay(-3, false);
    expect(b.value).toBe(50);
  });
  it('zone edges', () => {
    const b = new Burn();
    const z = (n: number) => { b.clear('x'); b.add(n, 't'); return b.zone(); };
    expect([z(0), z(39), z(40), z(74), z(75), z(100)]).toEqual(['warm', 'warm', 'blaze', 'blaze', 'cinder', 'cinder']);
  });
  it('fires onChange only on actual change', () => {
    const b = new Burn();
    const cb = vi.fn();
    b.onChange = cb;
    b.clear('r');
    b.add(0, 't');
    expect(cb).not.toHaveBeenCalled();
    b.add(10, 't');
    expect(cb).toHaveBeenCalledWith(10, 0);
    b.add(200, 't');
    b.add(5, 't');
    expect(cb).toHaveBeenCalledTimes(2);
  });
  it('persists round trip', () => {
    const a = new Burn();
    a.add(33, 't');
    a.addScar(2);
    const b = new Burn();
    const d = JSON.parse(JSON.stringify(a.serialize()));
    b.load(d, a.version);
    expect(b.value).toBe(33);
    expect(b.scars).toBe(2);
    expect(a.key).toBe('burn');
  });
  it('rejects bad data and newer versions', () => {
    const b = new Burn();
    b.add(20, 't');
    for (const bad of [null, 5, 'x', {}, { burn: 'a', scars: 0 }, { burn: NaN, scars: 0 }, { burn: 5, scars: -1 }, { burn: 5 }]) b.load(bad, 1);
    b.load({ burn: 90, scars: 0 }, 2);
    b.load({ burn: 90, scars: 0 }, 0);
    expect(b.value).toBe(20);
    expect(b.scars).toBe(0);
  });
  it('multiplier is live by default and 1 when the seam is switched off', () => {
    const b = new Burn();
    b.add(90, 't');
    b.addScar(15);
    expect(b.healthMultiplier()).toBeLessThan(0.5);
    expect(b.healthMultiplier(false)).toBe(1);
  });
  it('multiplier with the penalty enabled', () => {
    const b = new Burn();
    expect(b.healthMultiplier(true)).toBe(1);
    b.add(39, 't');
    expect(b.healthMultiplier(true)).toBeCloseTo(0.85);
    b.clear('x'); b.add(40, 't');
    expect(b.healthMultiplier(true)).toBeCloseTo(0.84);
    b.clear('x'); b.add(74, 't');
    expect(b.healthMultiplier(true)).toBeCloseTo(0.7);
    b.clear('x'); b.add(75, 't');
    expect(b.healthMultiplier(true)).toBeCloseTo(0.69);
    b.clear('x'); b.add(100, 't');
    expect(b.healthMultiplier(true)).toBeCloseTo(0.6);
    b.clear('x');
    b.addScar(5);
    expect(b.healthMultiplier(true)).toBeCloseTo(0.9);
    b.addScar(50);
    expect(b.healthMultiplier(true)).toBeCloseTo(0.7);
  });
  it('decay notifies only when the displayed value changes; add and clear always notify', () => {
    const b = new Burn();
    b.add(50, 't');
    const events: Array<[number, number]> = [];
    b.onChange = (v, p) => events.push([v, p]);
    const start = b.value;
    for (let i = 0; i < 60 * 60; i++) b.decay(1 / 60, false); // 60 s -> 12 points
    const change = start - b.value;
    expect(change).toBeCloseTo(12, 5);
    expect(events.length).toBeLessThanOrEqual(Math.ceil(change) + 1);
    expect(events.length).toBeGreaterThan(0);
    expect(Number.isInteger(b.value)).toBe(false); // the internal value stays a float
    const n = events.length;
    b.add(0.1, 't');
    b.clear('x');
    expect(events.length).toBe(n + 2);
    expect(events.at(-1)).toEqual([0, events.at(-2)![0]]);
  });
});
describe('Burn events', () => {
  it('load notifies when the value changes', () => {
    const b = new Burn();
    const cb = vi.fn();
    b.onChange = cb;
    b.load({ burn: 30, scars: 0 }, 1);
    expect(cb).toHaveBeenCalledWith(30, 0);
  });
});

describe('Burn boundary notifications', () => {
  it('decay reports the final 0 even when the rounded value did not change', () => {
    const b = new Burn();
    const seen: number[] = [];
    b.add(1, 't');
    b.onChange = (v) => seen.push(v);
    b.decay(10, false);
    expect(b.value).toBe(0);
    expect(seen[seen.length - 1]).toBe(0);
  });
});

describe('Burn.useShard', () => {
  it('scars only when Burn was 75 or more before the gain', () => {
    const b = new Burn();
    b.add(74, 't');
    expect(b.useShard(8, 'leap')).toMatchObject({ scarred: false });
    expect(b.scars).toBe(0);
    b.clear('x');
    b.add(75, 't');
    expect(b.useShard(8, 'leap')).toMatchObject({ scarred: true });
    expect(b.scars).toBe(1);
  });
  it('a fractional 74.6 does not scar (zone() floors)', () => {
    const b = new Burn();
    b.add(74.6, 't');
    expect(b.zone()).toBe('blaze');
    expect(b.useShard(8, 'surge').scarred).toBe(false);
  });
  it('still scars when the gain is clamped at 100, and at 100 exactly', () => {
    const b = new Burn();
    b.add(100, 't');
    const r = b.useShard(25, 'surge');
    expect(r).toEqual({ gained: 0, scarred: true });
    expect(b.value).toBe(100);
    expect(b.scars).toBe(1);
  });
  it('a caller can decide the Scar at the press', () => {
    const b = new Burn();
    b.add(80, 't');
    expect(b.useShard(8, 'leap', false).scarred).toBe(false);
    expect(b.scars).toBe(0);
    b.clear('x');
    expect(b.useShard(8, 'leap', true).scarred).toBe(true);
    expect(b.scars).toBe(1);
  });
  it('ignores a NaN gain but still scars at cinder (the use happened)', () => {
    const b = new Burn();
    b.add(90, 't');
    expect(b.useShard(Number.NaN, 'x')).toEqual({ gained: 0, scarred: true });
    expect(b.value).toBe(90);
  });
  it('rest-style clear never removes Scars', () => {
    const b = new Burn();
    b.add(90, 't');
    b.useShard(10, 'surge');
    b.clear('rest');
    expect(b.value).toBe(0);
    expect(b.scars).toBe(1);
  });
});

describe('Burn.healthMultiplier (design 9.7)', () => {
  it('matches the zone table at its edges', () => {
    const b = new Burn();
    const at = (n: number) => { b.clear('x'); b.add(n, 't'); return b.healthMultiplier(true); };
    expect(at(0)).toBe(1);
    expect(at(39)).toBeCloseTo(0.85, 4);
    expect(at(40)).toBeCloseTo(0.84, 4);
    expect(at(74)).toBeCloseTo(0.7, 2);
    expect(at(75)).toBeCloseTo(0.69, 4);
    expect(at(100)).toBeCloseTo(0.6, 4);
  });
  it('Scars multiply with the zone penalty and cap at 30%', () => {
    const b = new Burn();
    b.addScar(5);
    expect(b.healthMultiplier(true)).toBeCloseTo(0.9, 4);
    b.add(39, 't');
    expect(b.healthMultiplier(true)).toBeCloseTo(0.9 * 0.85, 4);
    b.clear('x');
    b.addScar(20);
    expect(b.scars).toBe(25);
    expect(b.healthMultiplier(true)).toBeCloseTo(0.7, 4);
  });
});
