import { describe, expect, it } from 'vitest';
import { ParticleBudget } from './ParticleBudget';

describe('ParticleBudget', () => {
  it('grants up to the cap and no more', () => {
    const b = new ParticleBudget(100);
    expect(b.request(60)).toBe(60);
    expect(b.request(60)).toBe(40);
    expect(b.request(1)).toBe(0);
    expect(b.used).toBe(100);
  });
  it('scale limits and clamps', () => {
    const b = new ParticleBudget(100);
    b.setScale(0.5);
    expect(b.limit).toBe(50);
    expect(b.request(80)).toBe(50);
    b.scale = 0;
    expect(b.scale).toBe(0.1);
    b.scale = 5;
    expect(b.scale).toBe(1);
    b.scale = NaN;
    expect(b.scale).toBe(1);
  });
  it('lowering scale below used grants nothing until released', () => {
    const b = new ParticleBudget(100);
    b.request(80);
    b.setScale(0.5);
    expect(b.request(10)).toBe(0);
    b.release(40);
    expect(b.request(10)).toBe(10);
  });
  it('release never underflows and ignores junk', () => {
    const b = new ParticleBudget(10);
    b.request(3);
    b.release(99);
    expect(b.used).toBe(0);
    b.release(NaN);
    b.release(-4);
    expect(b.used).toBe(0);
  });
  it('rejects zero, negative, NaN requests', () => {
    const b = new ParticleBudget(10);
    expect(b.request(0)).toBe(0);
    expect(b.request(-3)).toBe(0);
    expect(b.request(NaN)).toBe(0);
    expect(b.request(2.9)).toBe(2);
  });
});
