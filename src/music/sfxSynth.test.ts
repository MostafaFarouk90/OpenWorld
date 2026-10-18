import { describe, expect, it } from 'vitest';
import { SFX_IDS } from './sfxLayers';
import { sfxKey, sfxSeconds, SFX_VARIANTS, synthSfx } from './sfxSynth';

const SR = 22050;
const cases = SFX_IDS.flatMap((id) => [0, 1, 2].map((v) => [id, v] as const));

describe('synthSfx', () => {
  it('has three variants', () => expect(SFX_VARIANTS).toBe(3));

  it.each(cases)('%s variant %i is a valid sample', (id, v) => {
    const s = synthSfx(id, v, SR);
    expect(s).toBeInstanceOf(Float32Array);
    expect(s.length).toBeGreaterThan(0);
    expect(s.length).toBe(Math.round(sfxSeconds(id) * SR));
    let peak = 0;
    for (const x of s) {
      expect(Number.isFinite(x)).toBe(true);
      expect(Math.abs(x)).toBeLessThanOrEqual(1);
      peak = Math.max(peak, Math.abs(x));
    }
    expect(peak).toBeGreaterThan(0.01);
    expect(Math.abs(s[s.length - 1])).toBeLessThan(0.01);
    expect(Array.from(synthSfx(id, v, SR))).toEqual(Array.from(s));
  });

  it.each(SFX_IDS.map((id) => [id]))('%s variants differ', (id) => {
    const a = Array.from(synthSfx(id, 0, SR));
    const b = Array.from(synthSfx(id, 1, SR));
    const c = Array.from(synthSfx(id, 2, SR));
    expect(a).not.toEqual(b);
    expect(b).not.toEqual(c);
    expect(a).not.toEqual(c);
  });

  it('length scales with sample rate', () => {
    expect(synthSfx(SFX_IDS[0], 0, 44100).length).toBe(Math.round(sfxSeconds(SFX_IDS[0]) * 44100));
  });

  it('throws on bad variants', () => {
    for (const v of [-1, 3, 1.5, NaN]) expect(() => synthSfx(SFX_IDS[0], v, SR)).toThrow(/variant/i);
  });

  it('throws on unknown id', () => {
    expect(() => synthSfx('sfx.nope' as never, 0, SR)).toThrow(/No placeholder synth/);
  });
});

describe('sfxSeconds / sfxKey', () => {
  it('reports positive durations', () => {
    for (const id of SFX_IDS) expect(sfxSeconds(id)).toBeGreaterThan(0);
    expect(sfxSeconds('sfx.swing.light')).toBe(0.22);
    expect(sfxSeconds('sfx.armour-ring')).toBe(0.6);
  });
  it('formats keys as id#variant', () => {
    expect(sfxKey('sfx.thump', 2)).toBe('sfx.thump#2');
    expect(sfxKey('sfx.block', 0)).toBe('sfx.block#0');
  });
});
