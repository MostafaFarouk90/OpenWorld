import { describe, expect, it } from 'vitest';
import { FOX_FIRE, FoxFire } from './foxFire';

function make() {
  const log = { flag: [] as boolean[], applied: [] as number[], removed: 0 };
  const f = new FoxFire({
    setActiveFlag: (on) => log.flag.push(on),
    emitApplied: (s) => log.applied.push(s),
    emitRemoved: () => log.removed++,
  });
  return { f, log };
}

describe('FoxFire', () => {
  it('lasts 30 minutes, mirrors the flag and expires with one removal', () => {
    const { f, log } = make();
    f.apply();
    expect(f.active()).toBe(true);
    expect(log.applied).toEqual([1800]);
    expect(log.flag.at(-1)).toBe(true);
    f.update(1799);
    expect(f.active()).toBe(true);
    f.update(2);
    expect(f.active()).toBe(false);
    expect(log.removed).toBe(1);
    expect(log.flag.at(-1)).toBe(false);
    f.update(5);
    expect(log.removed).toBe(1);
  });

  it('a second apply refreshes to the full time and never stacks', () => {
    const { f } = make();
    f.apply();
    f.update(1000);
    f.apply();
    expect(f.secondsLeft()).toBe(FOX_FIRE.seconds);
    f.apply();
    expect(f.secondsLeft()).toBe(FOX_FIRE.seconds);
  });

  it('round-trips a save, caps a hostile value and re-announces', () => {
    const { f, log } = make();
    f.apply();
    f.update(600);
    const data = f.serialize();
    expect(data).toEqual({ remaining: 1200 });
    const b = make();
    b.f.load(data);
    expect(b.f.secondsLeft()).toBe(1200);
    b.f.announce();
    expect(b.log.applied).toEqual([1200]);
    b.f.load({ remaining: 1e9 });
    expect(b.f.secondsLeft()).toBe(FOX_FIRE.seconds);
    expect(log.removed).toBe(0);
  });

  it('a load without an entry, or garbage, clears the buff and the flag', () => {
    const { f, log } = make();
    f.apply();
    f.load(null);
    expect(f.active()).toBe(false);
    expect(log.removed).toBe(1);
    for (const bad of [{ remaining: 'x' }, { remaining: -3 }, { remaining: NaN }, undefined, 5]) {
      f.load(bad);
      expect(f.active()).toBe(false);
    }
    expect(log.flag.at(-1)).toBe(false);
  });

  it('serialises nothing when idle', () => {
    expect(make().f.serialize()).toBeNull();
  });
});
