import { describe, expect, it, vi } from 'vitest';
import { Cooled } from './cooled';
import { SHRINE_TUNING } from './tuning';

function make() {
  const mods = new Map<string, () => number>();
  const ports = {
    addMaxHealthModifier: vi.fn((id: string, fn: () => number) => {
      mods.set(id, fn);
      return () => mods.delete(id);
    }),
    refreshMaxHealth: vi.fn(),
    emitApplied: vi.fn(),
    emitRemoved: vi.fn(),
  };
  const c = new Cooled(ports);
  const mult = () => [...mods.values()].reduce((m, f) => m * f(), 1);
  return { c, ports, mods, mult };
}

describe('Cooled', () => {
  it('gives +10% for 20 minutes, then expires', () => {
    const { c, ports, mult, mods } = make();
    c.apply();
    expect(mult()).toBeCloseTo(1.1);
    expect(ports.emitApplied).toHaveBeenCalledWith(1200);
    c.update(1199);
    expect(c.active).toBe(true);
    c.update(2);
    expect(c.active).toBe(false);
    expect(mods.size).toBe(0);
    expect(ports.emitRemoved).toHaveBeenCalledTimes(1);
  });
  it('a second rest refreshes the timer and does not stack', () => {
    const { c, ports, mult } = make();
    c.apply();
    c.update(600);
    c.apply();
    expect(c.secondsLeft()).toBe(SHRINE_TUNING.cooled.seconds);
    expect(ports.addMaxHealthModifier).toHaveBeenCalledTimes(1);
    expect(mult()).toBeCloseTo(1.1);
  });
  it('multiplies with other modifiers instead of replacing them', () => {
    const { c, mods, mult } = make();
    mods.set('burn', () => 0.7);
    c.apply();
    expect(mult()).toBeCloseTo(0.77);
  });
  it('ignores a non-positive or NaN tick', () => {
    const { c } = make();
    c.apply();
    c.update(-5);
    c.update(Number.NaN);
    expect(c.secondsLeft()).toBe(1200);
  });
  it('round-trips through a save and re-announces for the HUD', () => {
    const a = make();
    a.c.apply();
    a.c.update(100);
    const data = a.c.serialize(150);
    const b = make();
    expect(b.c.load(data)).toBe(150);
    expect(b.c.secondsLeft()).toBe(1100);
    expect(b.mult()).toBeCloseTo(1.1);
    b.ports.emitApplied.mockClear();
    b.c.announce();
    expect(b.ports.emitApplied).toHaveBeenCalledWith(1100);
  });
  it('saves nothing when off', () => {
    expect(make().c.serialize(10)).toBeNull();
  });
  it.each([null, undefined, {}, { remaining: 'x' }, { remaining: -3 }, { remaining: Number.NaN }, 'junk'])(
    'ignores a corrupt save %j',
    (bad) => {
      const { c, mult } = make();
      expect(c.load(bad)).toBeNull();
      expect(c.active).toBe(false);
      expect(mult()).toBe(1);
    },
  );
  it('a load without Cooled clears a running one', () => {
    const { c, ports } = make();
    c.apply();
    c.load(null);
    expect(c.active).toBe(false);
    expect(ports.emitRemoved).toHaveBeenCalled();
  });
  it('caps a tampered long timer at the buff length', () => {
    const { c } = make();
    c.load({ remaining: 99999 });
    expect(c.secondsLeft()).toBe(1200);
  });
  it('teardown disposes the modifier', () => {
    const { c, mods } = make();
    c.apply();
    c.teardown();
    expect(mods.size).toBe(0);
  });
});
