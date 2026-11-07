import { describe, expect, it } from 'vitest';
import { SR } from '../sfxKit';
import { ACT5_LOOP_KEYS, ACT5_ON_DEMAND_KEYS, ACT5_SFX_KEYS, ACT5_SFX_VOLUME, act5SfxSamples, type Act5SfxKey } from './act5Sfx';
import { ARENA_DROP_PIECE, DRAGON_ALLY_ID, MOVE_SFX_ACT5, RAM_SFX_ACT5 } from './act5SfxEvents';
import { makeBedSamples } from '../AmbienceBed';
import { CALDERA_BED_SECONDS, fillCalderaBed } from './ambienceAct5';
import { REGION_INFO } from '../../region/regions';

const cache = new Map<string, Float32Array>();
const s = (k: Act5SfxKey) => cache.get(k) ?? (cache.set(k, act5SfxSamples(k)), cache.get(k)!);

describe('Act 5 SFX samples', () => {
  it.each([...ACT5_SFX_KEYS])('%s renders finite, audible and under full scale', (key) => {
    const x = s(key);
    expect(x.length).toBeGreaterThan(SR * 0.05);
    let peak = 0;
    let finite = true;
    for (const v of x) {
      finite &&= Number.isFinite(v);
      peak = Math.max(peak, Math.abs(v));
    }
    expect(finite).toBe(true);
    expect(peak).toBeGreaterThan(0.05);
    expect(peak).toBeLessThan(1);
  });

  it('is deterministic', () => {
    for (const key of ['sfx.lava.loop', 'sfx.gate.breach', 'sfx.dragon.breath', 'sfx.anvil.strike'] as const) {
      expect(act5SfxSamples(key)).toEqual(s(key));
    }
  });

  it.each([...ACT5_LOOP_KEYS])('%s loops without a click at the seam', (key) => {
    const x = s(key);
    let maxStep = 0;
    for (let i = 1; i < x.length; i++) maxStep = Math.max(maxStep, Math.abs(x[i] - x[i - 1]));
    expect(Math.abs(x[0] - x[x.length - 1])).toBeLessThanOrEqual(maxStep + 1e-6);
  });

  it('every key has a volume in (0, 1], and the on-demand keys are real keys', () => {
    for (const key of ACT5_SFX_KEYS) {
      expect(ACT5_SFX_VOLUME[key]).toBeGreaterThan(0);
      expect(ACT5_SFX_VOLUME[key]).toBeLessThanOrEqual(1);
    }
    for (const k of ACT5_ON_DEMAND_KEYS) expect(ACT5_SFX_KEYS).toContain(k);
  });

  it('every table entry names a registered key, and the gong and the Anvil sound longer than the hits', () => {
    const keys = new Set<string>(ACT5_SFX_KEYS);
    for (const t of [MOVE_SFX_ACT5, RAM_SFX_ACT5]) for (const k of Object.values(t)) expect(keys.has(k), k).toBe(true);
    expect(s('sfx.anvil.strike').length).toBeGreaterThan(s('sfx.gate.hit').length * 3);
    expect(ARENA_DROP_PIECE.test('floor.hammer-hall')).toBe(true);
    expect(DRAGON_ALLY_ID.test('dragon.ysmeryth')).toBe(true);
  });
});

describe('the Caldera bed', () => {
  it('the registry names it, and it renders deterministic, finite, in the other beds\' level range and seamless', () => {
    expect(REGION_INFO.caldera.bed).toBe('caldera');
    const sr = 8000;
    const a = makeBedSamples('caldera', sr);
    expect(a).toEqual(makeBedSamples('caldera', sr));
    expect(a.length).toBe(Math.round(CALDERA_BED_SECONDS * sr));
    let peak = 0;
    let maxStep = 0;
    let sum = 0;
    for (let i = 0; i < a.length; i++) {
      expect(Number.isFinite(a[i])).toBe(true);
      peak = Math.max(peak, Math.abs(a[i]));
      sum += a[i] * a[i];
      if (i > 0) maxStep = Math.max(maxStep, Math.abs(a[i] - a[i - 1]));
    }
    expect(peak).toBeGreaterThan(0.3);
    expect(peak).toBeLessThanOrEqual(0.7 + 1e-6);
    expect(Math.sqrt(sum / a.length)).toBeGreaterThan(0.02);
    expect(Math.abs(a[0] - a[a.length - 1])).toBeLessThanOrEqual(maxStep);
  });

  it('differs from the Waste bed, and the fill leaves an unknown seed deterministic', () => {
    const waste = makeBedSamples('ashen-waste', 4000);
    const cal = makeBedSamples('caldera', 4000);
    expect(Array.from(waste.slice(0, 200)).join(',')).not.toBe(Array.from(cal.slice(0, 200)).join(','));
    const x = new Float32Array(1000);
    const y = new Float32Array(1000);
    fillCalderaBed(x, 800, 4000, 7);
    fillCalderaBed(y, 800, 4000, 7);
    expect(x).toEqual(y);
  });
});
