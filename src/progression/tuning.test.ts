import { describe, expect, it } from 'vitest';
import { killXp, levelForXp, levelPoints, levelScale, xpForLevel, LEVEL_CAP } from './tuning';

describe('tuning', () => {
  it('xp curve', () => {
    expect(xpForLevel(1)).toBe(0);
    expect(xpForLevel(2)).toBe(50);
    expect(Math.abs(xpForLevel(9) - 4860)).toBeLessThan(100);
    expect(xpForLevel(40)).toBeGreaterThan(150000);
    expect(xpForLevel(40)).toBeLessThan(170000);
  });
  it('thresholds', () => {
    expect(levelForXp(49)).toBe(1);
    expect(levelForXp(50)).toBe(2);
    expect(levelForXp(1e12)).toBe(LEVEL_CAP);
    expect(levelForXp(NaN)).toBe(1);
  });
  it('point schedule totals 21 by level 38 and 13 by 14', () => {
    expect(levelPoints(1)).toBe(0);
    expect(levelPoints(2)).toBe(1);
    expect(levelPoints(14)).toBe(13);
    expect(levelPoints(16)).toBe(13);
    expect(levelPoints(17)).toBe(14);
    expect(levelPoints(40)).toBe(21);
  });
  it('level scaling clamps', () => {
    expect(levelScale(1, 1)).toBe(1);
    expect(levelScale(1, 30)).toBe(0.25);
    expect(levelScale(30, 1)).toBe(2);
    expect(killXp('ash-wraith', 1, 1)).toBe(20);
    expect(killXp('blighted-soldier', 3, 1)).toBe(39);
    expect(killXp('dummy', 50, 1)).toBe(0);
    expect(killXp('scarecrow', 5, 1)).toBe(0);
    expect(killXp('mystery', 5, 1)).toBe(0);
  });
});
