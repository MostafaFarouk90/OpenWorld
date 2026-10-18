import { describe, expect, it } from 'vitest';
import { StealthEffects } from './hooks';

describe('StealthEffects (Quiet Soles and Ash Cloud hooks)', () => {
  it('noise scales multiply and release idempotently', () => {
    const e = new StealthEffects();
    const a = e.addNoiseScale('quiet-soles', 0);
    const b = e.addNoiseScale('boots', 0.5);
    expect(e.noiseScale()).toBe(0);
    a();
    a();
    expect(e.noiseScale()).toBe(0.5);
    b();
    expect(e.noiseScale()).toBe(1);
  });

  it('clamps bad scales and refuses an empty source', () => {
    const e = new StealthEffects();
    e.addNoiseScale('x', 7);
    e.addNoiseScale('y', NaN);
    expect(e.noiseScale()).toBe(1);
    expect(() => e.addNoiseScale('', 0)).toThrow();
  });

  it('Ash Cloud blocks for its seconds, then expires; early release works', () => {
    const e = new StealthEffects();
    e.addSightBlocker({ x: 1, z: 2, r: 3, seconds: 6 });
    const early = e.addSightBlocker({ x: 9, z: 9, r: 1, seconds: 6 });
    expect(e.blockers()).toHaveLength(2);
    early();
    early();
    expect(e.blockers()).toEqual([{ x: 1, z: 2, r: 3 }]);
    for (let i = 0; i < 359; i++) e.tick(1 / 60);
    expect(e.blockers()).toHaveLength(1);
    e.tick(2 / 60);
    expect(e.blockers()).toHaveLength(0);
  });

  it('ignores invalid clouds', () => {
    const e = new StealthEffects();
    e.addSightBlocker({ x: NaN, z: 0, r: 1, seconds: 1 })();
    e.addSightBlocker({ x: 0, z: 0, r: 0, seconds: 1 });
    expect(e.blockers()).toHaveLength(0);
  });
});
