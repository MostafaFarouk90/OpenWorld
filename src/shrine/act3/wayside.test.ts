import { describe, expect, it } from 'vitest';
import { WaysideShrines } from './wayside';

function setup(r17 = 'active') {
  const flags = new Set<string>();
  const state = { r17 };
  const lit: number[] = [];
  const warnings: string[] = [];
  const w = new WaysideShrines({
    getBool: (k) => flags.has(k),
    setFlag: (k, v) => void (v ? flags.add(k) : flags.delete(k)),
    questState: (id) => (id === 'r17' ? state.r17 : 'inactive'),
    emitLit: (i) => lit.push(i),
    warn: (m) => warnings.push(m),
  });
  return { w, flags, state, lit, warnings };
}

describe('R17 wayside shrines', () => {
  it('light only while R17 is active', () => {
    for (const s of ['inactive', 'completed', 'failed']) {
      const t = setup(s);
      expect(t.w.canLight(1)).toBe(false);
      expect(t.w.light(1)).toBe(false);
      expect(t.flags.size).toBe(0);
    }
    const t = setup();
    expect(t.w.light(1)).toBe(true);
    expect(t.flags.has('world.wayside.1.lit')).toBe(true);
    expect(t.lit).toEqual([1]);
  });

  it('a lit shrine does not light again and keeps its flag after R17 ends', () => {
    const t = setup();
    t.w.light(2);
    expect(t.w.light(2)).toBe(false);
    expect(t.lit).toEqual([2]);
    t.state.r17 = 'completed';
    expect(t.w.lit(2)).toBe(true);
    expect(t.w.count()).toBe(1);
  });

  it('rejects an index outside 1..6', () => {
    const t = setup();
    for (const i of [0, 7, 1.5, NaN]) expect(t.w.light(i)).toBe(false);
  });

  it('the gate port blocks, per index, and a replaced or removed gate stops applying', () => {
    const t = setup();
    const off = t.w.setLightGate((i) => i === 3);
    expect(t.w.light(1)).toBe(false);
    expect(t.w.light(3)).toBe(true);
    off();
    expect(t.w.light(1)).toBe(true);
  });

  it('a gate that throws reads as blocked and warns', () => {
    const t = setup();
    t.w.setLightGate(() => {
      throw new Error('boom');
    });
    expect(t.w.canLight(1)).toBe(false);
    expect(t.w.light(1)).toBe(false);
    expect(t.flags.size).toBe(0);
    expect(t.warnings.length).toBeGreaterThan(0);
  });

  it('a gate that returns a non-true value is blocked', () => {
    const t = setup();
    t.w.setLightGate((() => undefined) as never);
    expect(t.w.canLight(1)).toBe(false);
  });

  it('counts all six and writes only world.wayside flags (never shrine flags)', () => {
    const t = setup();
    for (let i = 1; i <= 6; i++) t.w.light(i);
    expect(t.w.count()).toBe(6);
    expect([...t.flags].every((k) => k.startsWith('world.wayside.'))).toBe(true);
  });
});
