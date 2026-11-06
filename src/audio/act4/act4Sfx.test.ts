import { describe, expect, it } from 'vitest';
import { CHIME_PITCHES_HZ } from '../../music/act4Tracks';
import { SR } from '../sfxKit';
import { ACT4_LOOP_KEYS, ACT4_SFX_KEYS, ACT4_SFX_VOLUME, act4SfxSamples, pillarKey, type Act4SfxKey } from './act4Sfx';
import { ACT4_BOSS_IDS } from '../../bosses/act4Bosses';
import { ACT4_ENEMY_KINDS } from '../../enemies/types';
import { ENEMY_SKIN_IDS } from '../../enemies/skins';
import { BOSS_PHASE_SFX_ACT4, BOSS_RELEASED_SFX_ACT4, DIED_SFX_ACT4, HUSK_SFX, HUSK_SKIN, LOOP_BY_KIND_ACT4, MOVE_SFX_ACT4, WEATHER_SFX } from './act4SfxEvents';
import { makeBedSamples } from '../AmbienceBed';
import { ASHEN_WASTE_BED_SECONDS, fillAshenWasteBed } from './ambienceAct4';

const cache = new Map<string, Float32Array>();
const s = (k: Act4SfxKey) => cache.get(k) ?? (cache.set(k, act4SfxSamples(k)), cache.get(k)!);

describe('Act 4 SFX samples', () => {
  it.each([...ACT4_SFX_KEYS])('%s renders finite, audible and under full scale', (key) => {
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
    for (const key of ['sfx.storm.loop', 'sfx.glass.pillar.3', 'sfx.husk.rasp', 'sfx.ebba.musicbox'] as const) {
      expect(act4SfxSamples(key)).toEqual(s(key));
    }
  });

  it.each([...ACT4_LOOP_KEYS])('%s loops without a click at the seam', (key) => {
    const x = s(key);
    let maxStep = 0;
    for (let i = 1; i < x.length; i++) maxStep = Math.max(maxStep, Math.abs(x[i] - x[i - 1]));
    // The step across the seam is no bigger than the loop's own sample-to-sample movement.
    expect(Math.abs(x[0] - x[x.length - 1])).toBeLessThanOrEqual(maxStep + 1e-6);
  });

  it('every key has a volume in (0, 1]', () => {
    for (const key of ACT4_SFX_KEYS) {
      expect(ACT4_SFX_VOLUME[key]).toBeGreaterThan(0);
      expect(ACT4_SFX_VOLUME[key]).toBeLessThanOrEqual(1);
    }
  });

  it('every table entry names a registered key', () => {
    const keys = new Set<string>(ACT4_SFX_KEYS);
    const tables = [MOVE_SFX_ACT4, DIED_SFX_ACT4, LOOP_BY_KIND_ACT4, HUSK_SFX, BOSS_PHASE_SFX_ACT4, BOSS_RELEASED_SFX_ACT4, WEATHER_SFX];
    for (const t of tables) for (const k of Object.values(t)) expect(keys.has(k), k).toBe(true);
    for (const k of Object.values(LOOP_BY_KIND_ACT4)) expect(ACT4_LOOP_KEYS).toContain(k);
  });
});

/** Goertzel power of `x` at `hz`. */
function power(x: Float32Array, hz: number, n: number): number {
  const w = (2 * Math.PI * hz) / SR;
  const c = 2 * Math.cos(w);
  let s1 = 0;
  let s2 = 0;
  for (let i = 0; i < n; i++) {
    const s0 = x[i] + c * s1 - s2;
    s2 = s1;
    s1 = s0;
  }
  return s1 * s1 + s2 * s2 - c * s1 * s2;
}

describe('the tables use L0 ids', () => {
  const bosses = new Set<string>(Object.values(ACT4_BOSS_IDS));
  const kinds = new Set<string>(ACT4_ENEMY_KINDS);
  it('death and loop kinds are Act 4 enemy kinds or boss ids; boss cues name Act 4 bosses; the husk skin is a skin', () => {
    for (const k of [...Object.keys(DIED_SFX_ACT4), ...Object.keys(LOOP_BY_KIND_ACT4)]) expect(kinds.has(k) || bosses.has(k), k).toBe(true);
    for (const k of [...Object.keys(BOSS_PHASE_SFX_ACT4), ...Object.keys(BOSS_RELEASED_SFX_ACT4)]) expect(bosses.has(k), k).toBe(true);
    expect(ENEMY_SKIN_IDS as readonly string[]).toContain(HUSK_SKIN);
  });
});

describe('the dream hum', () => {
  it('never steps between notes (its gain is smoothed)', () => {
    const x = s('sfx.dream.hum');
    let maxStep = 0;
    for (let i = 1; i < x.length; i++) maxStep = Math.max(maxStep, Math.abs(x[i] - x[i - 1]));
    // A low hum (under 250 Hz fundamental) at 0.85 peak moves well under 0.1 per sample at this rate.
    expect(maxStep).toBeLessThan(0.1);
  });
});

describe('glass pillars', () => {
  it('pillarKey maps 0 to 5 and refuses anything else', () => {
    expect(pillarKey(0)).toBe('sfx.glass.pillar.1');
    expect(pillarKey(5)).toBe('sfx.glass.pillar.6');
    expect(pillarKey(6)).toBeUndefined();
    expect(pillarKey(-1)).toBeUndefined();
    expect(pillarKey(1.5)).toBeUndefined();
  });

  it.each([0, 1, 2, 3, 4, 5])('pillar %i rings at its CHIME_PITCHES_HZ pitch', (i) => {
    const x = s(pillarKey(i)!);
    const n = Math.round(SR * 0.5);
    const hz = CHIME_PITCHES_HZ[i];
    const at = power(x, hz, n);
    // Stronger at its own pitch than a semitone either side, and than at any other pillar's pitch.
    expect(at).toBeGreaterThan(power(x, hz * 2 ** (1 / 12), n) * 4);
    expect(at).toBeGreaterThan(power(x, hz * 2 ** (-1 / 12), n) * 4);
    // Within 1%: over a 1 s window the pitch itself beats 1% either side.
    const long = SR;
    expect(power(x, hz, long)).toBeGreaterThan(power(x, hz * 1.01, long));
    expect(power(x, hz, long)).toBeGreaterThan(power(x, hz * 0.99, long));
    CHIME_PITCHES_HZ.forEach((other, j) => {
      if (j !== i) expect(at, `vs pillar ${j}`).toBeGreaterThan(power(x, other, n));
    });
  });
});

describe('Ashen Waste bed body', () => {
  it('fills finite, non-silent samples, the same for the same seed and different for another', () => {
    const sr = 8000;
    const n = ASHEN_WASTE_BED_SECONDS * sr;
    const a = new Float32Array(n + sr);
    const b = new Float32Array(n + sr);
    const c = new Float32Array(n + sr);
    fillAshenWasteBed(a, n, sr, 7);
    fillAshenWasteBed(b, n, sr, 7);
    fillAshenWasteBed(c, n, sr, 8);
    let rms = 0;
    let finite = true;
    for (const v of a) {
      finite &&= Number.isFinite(v);
      rms += v * v;
    }
    expect(finite).toBe(true);
    expect(Math.sqrt(rms / a.length)).toBeGreaterThan(0.01);
    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
  });
});

describe('Ashen Waste bed in AmbienceBed', () => {
  it('renders a seamless, normalised loop of ASHEN_WASTE_BED_SECONDS', () => {
    const sr = 8000;
    const x = makeBedSamples('ashen-waste', sr);
    expect(x.length).toBe(ASHEN_WASTE_BED_SECONDS * sr);
    let peak = 0;
    let maxStep = 0;
    for (let i = 0; i < x.length; i++) {
      peak = Math.max(peak, Math.abs(x[i]));
      if (i > 0) maxStep = Math.max(maxStep, Math.abs(x[i] - x[i - 1]));
    }
    expect(peak).toBeGreaterThan(0.1);
    expect(peak).toBeLessThanOrEqual(1);
    expect(Math.abs(x[0] - x[x.length - 1])).toBeLessThanOrEqual(maxStep + 1e-6);
  });
});
