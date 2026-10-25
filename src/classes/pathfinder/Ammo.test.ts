import { describe, expect, it } from 'vitest';
import { Ammo } from './Ammo';

const mk = (count: number, known = true) => {
  let n = count;
  return { ammo: new Ammo({ itemKnown: () => known, count: () => n, remove: (k) => (n >= k ? ((n -= k), true) : false) }), left: () => n };
};

describe('Ammo', () => {
  it('spends one bolt per take and refuses at zero', () => {
    const { ammo, left } = mk(2);
    expect(ammo.available()).toBe(2);
    expect(ammo.take()).toBe(true);
    expect(ammo.take()).toBe(true);
    expect(ammo.take()).toBe(false);
    expect(left()).toBe(0);
    expect(ammo.available()).toBe(0);
  });

  it('is unlimited while the item is undefined and spends nothing', () => {
    const { ammo, left } = mk(0, false);
    expect(ammo.limited).toBe(false);
    expect(ammo.available()).toBe(Infinity);
    expect(ammo.take()).toBe(true);
    expect(left()).toBe(0);
  });
});

describe('Ammo with master bolts', () => {
  const both = (plain: number, master: number, known = true) => {
    let p = plain;
    let m = master;
    return {
      ammo: new Ammo({
        itemKnown: () => known,
        count: () => p,
        remove: (k) => (p >= k ? ((p -= k), true) : false),
        masterCount: () => m,
        masterRemove: (k) => (m >= k ? ((m -= k), true) : false),
      }),
      left: () => ({ p, m }),
    };
  };

  it('is unchanged when no master bolts are held', () => {
    const { ammo, left } = both(2, 0);
    expect(ammo.available()).toBe(2);
    expect(ammo.take()).toBe(true);
    expect(ammo.lastWasMaster).toBe(false);
    expect(left()).toEqual({ p: 1, m: 0 });
  });

  it('counts both kinds and spends master bolts first, then plain ones', () => {
    const { ammo, left } = both(2, 1);
    expect(ammo.available()).toBe(3);
    expect(ammo.take()).toBe(true);
    expect(ammo.lastWasMaster).toBe(true);
    expect(left()).toEqual({ p: 2, m: 0 });
    expect(ammo.take()).toBe(true);
    expect(ammo.lastWasMaster).toBe(false);
    expect(ammo.take()).toBe(true);
    expect(ammo.take()).toBe(false);
    expect(ammo.lastWasMaster).toBe(false);
    expect(ammo.available()).toBe(0);
  });

  it('works with only master bolts', () => {
    const { ammo } = both(0, 1);
    expect(ammo.available()).toBe(1);
    expect(ammo.take()).toBe(true);
    expect(ammo.take()).toBe(false);
  });

  it('stays unlimited while the plain item is undefined', () => {
    const { ammo, left } = both(0, 3, false);
    expect(ammo.available()).toBe(Infinity);
    expect(ammo.take()).toBe(true);
    expect(left().m).toBe(3);
  });
});
