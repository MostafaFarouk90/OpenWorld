/**
 * Difficulty check for the hound fights (A16, final PR). A fresh level-9 Knight from a `?act2=` jump died four times to
 * R05's hounds; a character carried over from Act 1 (the headless chain: level 11 when R05 starts, 164 health, the
 * squire's sword, the wooden shield and no skills) is hit just as hard, so the numbers below are what the packs were
 * tuned against. The pounce is a red dodge-only leap that lands on the head (x2, `COMBAT.boneMultipliers.head`); three
 * level-14 pounces kill a level-11 Knight, and he needs about 12 sword hits (10 each) to kill one level-14 hound.
 */
import { describe, expect, it } from 'vitest';
import { COMBAT } from '../config/constants';
import { EMBER_HOUND } from '../enemies/hound/def';
import { scaleStats } from '../enemies/level';
import { baseMaxHealthForLevel } from '../progression/tuning';
import { CARRIED_KNIGHT } from './carriedKnight';
import { R05_FOG_BAND } from '../quests/content/act2/spawners';
import { M16_AMBUSH_BAND } from '../quests/content/act2/oldsmoke/spawners';
import { ACT2_SPAWNERS_A12 } from '../quests/content/act2/spawners';
import { OLDSMOKE_SPAWNERS } from '../quests/content/act2/oldsmoke/spawners';

const pounce = EMBER_HOUND.moves.find((m) => m.id === 'hound.pounce')!;
/** Damage of one pounce from a hound of `level` landing on the head (the leap's usual hit). */
const pounceHit = (level: number): number => pounce.damage * scaleStats(EMBER_HOUND, level).damageScale * COMBAT.boneMultipliers.head;
/** The carried Knight's max health and level when each quest starts (carriedKnight.ts: pinned against the live census by the chain tests). */
const knightHealth = (quest: keyof typeof CARRIED_KNIGHT): number => CARRIED_KNIGHT[quest].maxHealth;
export const CARRIED_LEVEL: Record<string, number> = { r05: CARRIED_KNIGHT.r05.level, m16: CARRIED_KNIGHT.m16.level };
/** One pounce may take at most this share of the carried character's health (two must be survivable). */
const POUNCE_SHARE_CAP = 0.36;

describe('the hound packs against the carried-over Knight', () => {
  it('the carried Knight\'s health is the class table\'s health trimmed by Burn, and the pounce follows the hound def', () => {
    for (const q of ['r05', 'm16'] as const) {
      const table = baseMaxHealthForLevel(CARRIED_KNIGHT[q].level, 'knight');
      expect(knightHealth(q), q).toBeLessThanOrEqual(table);
      expect(knightHealth(q), q).toBeGreaterThan(table * 0.6);
    }
    expect(pounceHit(14)).toBeGreaterThan(pounceHit(11));
  });

  it('a pounce of the region\'s top level (14) took 39% of the level-11 Knight\'s health in the old R05 band; the band now keeps it under the cap', () => {
    const hp = knightHealth('r05');
    expect(pounceHit(14) / hp).toBeGreaterThan(0.38);
    expect(pounceHit(R05_FOG_BAND.max) / hp).toBeLessThanOrEqual(POUNCE_SHARE_CAP);
  });

  it('M16\'s pass hounds stay at or under the Knight\'s level, and under the cap (the region reaches 19: 78 damage)', () => {
    const hp = knightHealth('m16');
    expect(pounceHit(19) / hp).toBeGreaterThan(0.38);
    expect(M16_AMBUSH_BAND.max).toBeLessThanOrEqual(CARRIED_LEVEL.m16);
    expect(pounceHit(M16_AMBUSH_BAND.max) / hp).toBeLessThanOrEqual(POUNCE_SHARE_CAP);
  });

  it('R05\'s fog hounds never out-level the Knight who starts R05, and the two groups carry their bands', () => {
    expect(R05_FOG_BAND.max).toBeLessThanOrEqual(CARRIED_LEVEL.r05);
    expect(R05_FOG_BAND.min).toBeLessThanOrEqual(R05_FOG_BAND.max);
    expect(ACT2_SPAWNERS_A12.find((s) => s.id === 'q12.r05.fog')!.band).toEqual(R05_FOG_BAND);
    expect(OLDSMOKE_SPAWNERS.find((s) => s.id === 'q13.m16.ambush')!.band).toEqual(M16_AMBUSH_BAND);
  });

  it('the other hound groups keep the region band (their Knight is within reach of its top)', () => {
    for (const id of ['q12.r07.den', 'q12.r07.mother', 'q12.r11.hounds', 'q12.m14.hounds']) {
      expect(ACT2_SPAWNERS_A12.find((s) => s.id === id)!.band, id).toBe('cinderreach');
    }
  });
});
