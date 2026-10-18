import { describe, expect, it, vi } from 'vitest';
import { SHRINE_IDS, WarmthTracker, shrineFlag, warmthTier } from './warmth';

const flags = (on: string[]) => (k: string) => on.includes(k);

describe('warmthTier', () => {
  it('is 0 with nothing lit and 8 with every main shrine lit', () => {
    expect(warmthTier(flags([]))).toBe(0);
    expect(warmthTier(flags(SHRINE_IDS.map(shrineFlag)))).toBe(8);
  });
  it('counts the Quenchstone as 1 whatever the waystone flag says', () => {
    expect(warmthTier(flags(['shrine.quenchstone.lit']))).toBe(1);
  });
  it('ignores the Kindling Dell and unknown shrines', () => {
    expect(warmthTier(flags(['shrine.kindling-dell.lit', 'shrine.nowhere.lit']))).toBe(0);
  });
  it('is order-free', () => {
    expect(warmthTier(flags(['shrine.anvil-of-ages.lit', 'shrine.quenchstone.lit']))).toBe(2);
  });
});

function make(initial: string[] = []) {
  const lit = new Set(initial);
  const emitChanged = vi.fn();
  const setEnemyTier = vi.fn();
  const w = new WarmthTracker({ isLit: (k) => lit.has(k), emitChanged, setEnemyTier });
  return { lit, w, emitChanged, setEnemyTier };
}

describe('WarmthTracker', () => {
  it('feeds the enemies service at setup', () => {
    const t = make();
    expect(t.setEnemyTier).toHaveBeenCalledWith(0);
  });
  it('emits warmth.changed once per change and feeds enemies', () => {
    const t = make();
    t.lit.add('shrine.quenchstone.lit');
    t.w.recompute('flag');
    t.w.recompute('flag');
    expect(t.emitChanged).toHaveBeenCalledTimes(1);
    expect(t.emitChanged).toHaveBeenCalledWith(1, 0);
    expect(t.setEnemyTier).toHaveBeenLastCalledWith(1);
    expect(t.w.tier()).toBe(1);
  });
  it('a load with two shrines lit gives W = 2 and calls setWarmthTier(2)', () => {
    const t = make();
    t.lit.add('shrine.quenchstone.lit').add('shrine.hushed-anvil.lit');
    t.w.recompute('load');
    expect(t.w.tier()).toBe(2);
    expect(t.setEnemyTier).toHaveBeenLastCalledWith(2);
    expect(t.emitChanged).toHaveBeenCalledWith(2, 0);
  });
  it('a load with an unchanged tier still overwrites the spawners value and emits nothing', () => {
    const t = make(['shrine.quenchstone.lit']);
    t.setEnemyTier.mockClear();
    t.w.recompute('load');
    expect(t.setEnemyTier).toHaveBeenCalledWith(1);
    expect(t.emitChanged).not.toHaveBeenCalled();
  });
  it('a flag event with an unchanged tier does nothing', () => {
    const t = make(['shrine.quenchstone.lit']);
    t.setEnemyTier.mockClear();
    t.w.recompute('flag');
    expect(t.setEnemyTier).not.toHaveBeenCalled();
  });
  it('a load that unlights a shrine lowers W', () => {
    const t = make(['shrine.quenchstone.lit']);
    t.lit.clear();
    t.w.recompute('load');
    expect(t.emitChanged).toHaveBeenCalledWith(0, 1);
    expect(t.setEnemyTier).toHaveBeenLastCalledWith(0);
  });
});
