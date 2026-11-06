import { describe, expect, it } from 'vitest';
import { ExposureClock, exposureDamage } from './exposure';

describe('exposure', () => {
  it('takes 2% of maximum health a tick', () => {
    expect(exposureDamage(500, 500)).toBeCloseTo(10, 9);
  });

  it('never takes health below 10%', () => {
    expect(exposureDamage(55, 500)).toBeCloseTo(5, 9); // 11% -> 10%
    expect(exposureDamage(50, 500)).toBe(0);
    expect(exposureDamage(25, 500)).toBe(0); // under the floor after a fight: no damage, no heal
    let h = 500;
    for (let i = 0; i < 200; i++) h -= exposureDamage(h, 500);
    expect(h).toBeCloseTo(50, 9);
  });

  it('rejects bad health values', () => {
    expect(exposureDamage(100, 0)).toBe(0);
    expect(exposureDamage(Number.NaN, 100)).toBe(0);
  });

  it('ticks every 3 s while exposed and counts continuous seconds', () => {
    const c = new ExposureClock();
    let ticks = 0;
    for (let i = 0; i < 180; i++) ticks += c.step(1 / 60, { inStorm: true, safe: false });
    expect(ticks).toBe(1);
    expect(c.seconds).toBeCloseTo(3, 6);
    for (let i = 0; i < 360; i++) ticks += c.step(1 / 60, { inStorm: true, safe: false });
    expect(ticks).toBe(3);
  });

  it('drops the partial tick when safe, so stepping on and off a rope earns nothing', () => {
    const c = new ExposureClock();
    let ticks = 0;
    for (let k = 0; k < 10; k++) {
      for (let i = 0; i < 150; i++) ticks += c.step(1 / 60, { inStorm: true, safe: false });
      ticks += c.step(1 / 60, { inStorm: true, safe: true });
    }
    expect(ticks).toBe(0);
    expect(c.seconds).toBe(0);
  });

  it('does not tick out of a storm', () => {
    const c = new ExposureClock();
    expect(c.step(10, { inStorm: false, safe: false })).toBe(0);
  });
});
