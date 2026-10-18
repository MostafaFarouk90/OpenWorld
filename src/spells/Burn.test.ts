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
  it('multiplier is 1 while the flag is false', () => {
    const b = new Burn();
    b.add(90, 't');
    b.addScar(15);
    expect(b.healthMultiplier()).toBe(1);
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
});
