import { describe, expect, it, vi } from 'vitest';
import { ASH_WRAITH } from './defs';
import { DEFAULT_BAND, REGION_BANDS, bandForRegion, enemyLevel, scaleStats } from './level';

const B = { min: 3, max: 7 };

describe('enemyLevel', () => {
  it('uses band min and max at roll 0 and 1, default roll 0', () => {
    expect(enemyLevel(B)).toBe(3);
    expect(enemyLevel(B, { roll: 0 })).toBe(3);
    expect(enemyLevel(B, { roll: 1 })).toBe(7);
    expect(enemyLevel(B, { roll: 0.5 })).toBe(5);
  });
  it('clamps roll and ignores non-finite roll without throwing', () => {
    expect(enemyLevel(B, { roll: 9 })).toBe(7);
    expect(enemyLevel(B, { roll: -2 })).toBe(3);
    expect(enemyLevel(B, { roll: NaN })).toBe(3);
  });
  it('throws RangeError on invalid bands', () => {
    expect(() => enemyLevel({ min: 5, max: 2 })).toThrow(RangeError);
    expect(() => enemyLevel({ min: NaN, max: 2 })).toThrow(RangeError);
    expect(() => enemyLevel({ min: 1, max: Infinity })).toThrow(RangeError);
    expect(() => enemyLevel({ min: 0, max: 2 })).toThrow(RangeError);
  });
  it('lockedLevel wins and is clamped to 1..cap', () => {
    const block = { id: 'a', offset: 3 };
    expect(enemyLevel(B, { lockedLevel: 12, block, warmthTier: 3, playerLevel: 10, roll: 1 })).toBe(12);
    expect(enemyLevel(B, { lockedLevel: 99 })).toBe(40);
    expect(enemyLevel(B, { lockedLevel: -4 })).toBe(1);
  });
  it('block formula: 18 + offset + 3(W-3), sub-band, clamps and cap', () => {
    const block = { id: 'a', offset: 2 };
    const band = { min: 1, max: 3 };
    expect(enemyLevel(band, { block, warmthTier: 3, playerLevel: 20 })).toBe(20); // 18+2 inside [11,25]
    expect(enemyLevel(band, { block, warmthTier: 4, playerLevel: 20, roll: 1 })).toBe(25); // 23 +2 -> 25
    expect(enemyLevel(band, { block, warmthTier: 8, playerLevel: 20 })).toBe(25); // 35 -> P+5
    expect(enemyLevel(band, { block, warmthTier: 0, playerLevel: 20 })).toBe(11); // 11 -> P-9 boundary
    expect(enemyLevel(band, { block, warmthTier: 0, playerLevel: 30 })).toBe(21); // 11 -> P-9
    expect(enemyLevel(band, { block, warmthTier: 8, playerLevel: 60 })).toBe(40); // cap
    expect(enemyLevel(band, { block: { id: 'n', offset: -50 }, warmthTier: 3, playerLevel: 1 })).toBe(1);
  });
  it('block formula needs all of block, tier and player level', () => {
    const block = { id: 'a', offset: 2 };
    expect(enemyLevel(B, { block, warmthTier: 3 })).toBe(3);
    expect(enemyLevel(B, { block, playerLevel: 20 })).toBe(3);
    expect(enemyLevel(B, { warmthTier: 3, playerLevel: 20 })).toBe(3);
  });
  it('ignores non-finite inputs with a warning', () => {
    const warn = vi.fn();
    expect(enemyLevel(B, { warmthTier: NaN, playerLevel: 20, block: { id: 'a', offset: 0 } }, warn)).toBe(3);
    expect(warn).toHaveBeenCalledOnce();
    expect(enemyLevel(B, { block: { id: 'a', offset: Infinity }, warmthTier: 3, playerLevel: 20 }, warn)).toBe(3);
  });
  it('falls back to console.warn once when no warn given', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    enemyLevel(B, { playerLevel: NaN });
    enemyLevel(B, { playerLevel: NaN });
    expect(spy.mock.calls.length).toBeLessThanOrEqual(1);
    spy.mockRestore();
  });
  it('result is always an integer in [1, cap]', () => {
    for (const r of [0, 0.13, 0.5, 0.77, 1]) {
      const l = enemyLevel({ min: 1, max: 9 }, { roll: r });
      expect(Number.isInteger(l)).toBe(true);
      expect(l).toBeGreaterThanOrEqual(1);
      expect(l).toBeLessThanOrEqual(40);
    }
  });
});

describe('regions', () => {
  it('brightwater is 1..9, unknown is undefined, default band 1..1', () => {
    expect(REGION_BANDS.brightwater).toEqual({ min: 1, max: 9 });
    expect(bandForRegion('brightwater')).toEqual({ min: 1, max: 9 });
    expect(bandForRegion('nowhere')).toBeUndefined();
    expect(bandForRegion('toString')).toBeUndefined();
    expect(DEFAULT_BAND).toEqual({ min: 1, max: 1 });
  });
});

describe('scaleStats', () => {
  it('level 1 equals the def', () => {
    expect(scaleStats(ASH_WRAITH, 1)).toEqual({ maxHealth: ASH_WRAITH.maxHealth, damageScale: 1 });
  });
  it('grows with level', () => {
    const s = scaleStats(ASH_WRAITH, 5);
    expect(s.maxHealth).toBeGreaterThan(ASH_WRAITH.maxHealth);
    expect(s.damageScale).toBeCloseTo(1.4);
  });
});
