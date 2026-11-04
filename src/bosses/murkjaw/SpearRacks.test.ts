import { describe, expect, it } from 'vitest';
import { SpearRacks } from './SpearRacks';
import { SPEARS } from './tuning';

describe('SpearRacks', () => {
  it('starts full; takes one spear at a time', () => {
    const r = new SpearRacks(4);
    expect([0, 1, 2, 3].map((i) => r.count(i))).toEqual([3, 3, 3, 3].map(() => SPEARS.perRack));
    expect(r.take(1)).toBe(true);
    expect(r.carrying).toBe(true);
    expect(r.count(1)).toBe(SPEARS.perRack - 1);
    expect(r.take(2)).toBe(false);
    expect(r.canTake(2)).toBe(false);
    expect(r.count(2)).toBe(SPEARS.perRack);
  });

  it('a throw empties the hand and names the rack; an empty hand throws nothing', () => {
    const r = new SpearRacks(4);
    expect(r.throw()).toBe(-1);
    r.take(3);
    expect(r.throw()).toBe(3);
    expect(r.carrying).toBe(false);
  });

  it('an empty rack refuses, then refills one spear every refillSeconds, never past full', () => {
    const r = new SpearRacks(1);
    for (let i = 0; i < SPEARS.perRack; i++) {
      expect(r.take(0)).toBe(true);
      r.throw();
    }
    expect(r.take(0)).toBe(false);
    r.tick(SPEARS.refillSeconds - 0.1);
    expect(r.count(0)).toBe(0);
    r.tick(0.2);
    expect(r.count(0)).toBe(1);
    for (let i = 0; i < 20; i++) r.tick(SPEARS.refillSeconds);
    expect(r.count(0)).toBe(SPEARS.perRack);
    r.tick(NaN);
    r.tick(-1);
    expect(r.count(0)).toBe(SPEARS.perRack);
  });

  it('putBack and returnTo restore a spear; reset fills every rack and empties the hand', () => {
    const r = new SpearRacks(2);
    r.putBack();
    expect(r.count(0)).toBe(SPEARS.perRack);
    r.take(0);
    r.putBack();
    expect(r.carrying).toBe(false);
    expect(r.count(0)).toBe(SPEARS.perRack);
    r.take(1);
    const from = r.throw();
    r.returnTo(from);
    r.returnTo(-1);
    r.returnTo(9);
    expect(r.count(1)).toBe(SPEARS.perRack);
    r.take(0);
    r.reset();
    expect(r.carrying).toBe(false);
    expect(r.count(0)).toBe(SPEARS.perRack);
  });
});
