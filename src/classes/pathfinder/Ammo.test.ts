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
