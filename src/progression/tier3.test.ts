import { describe, expect, it } from 'vitest';
import { makeProgression } from './testkit';
import { SKILLS, getSkill } from './skills';
import { xpForLevel } from './tuning';

const KNIGHT_TIER3 = ['knight.oathward', 'knight.chargeOfTheHalvard', 'knight.squiresResolve'];

describe('Knight tier 3 (Act 2)', () => {
  it('each skill costs 2, requires its tier 2 and is available', () => {
    const requires = { 'knight.oathward': 'knight.ironStance', 'knight.chargeOfTheHalvard': 'knight.flowingCuts', 'knight.squiresResolve': 'knight.bannerPlant' };
    for (const id of KNIGHT_TIER3) {
      const s = getSkill(id)!;
      expect([s.tier, s.cost, s.available, s.requires]).toEqual([3, 2, true, requires[id as keyof typeof requires]]);
    }
  });
  it('the two actives carry their cooldown and Ember cost, the passive none', () => {
    expect([getSkill('knight.oathward')!.cooldown, getSkill('knight.oathward')!.emberCost]).toEqual([30, 15]);
    expect([getSkill('knight.chargeOfTheHalvard')!.cooldown, getSkill('knight.chargeOfTheHalvard')!.emberCost]).toEqual([12, 15]);
    expect(getSkill('knight.squiresResolve')!.cooldown).toBeUndefined();
  });
  it('learning needs the tier 2 skill and 2 points; tier 4 is refused', () => {
    const { p } = makeProgression();
    p.grantXp(xpForLevel(12), 'x');
    expect(p.learn('knight.oathward')).toEqual({ ok: false, reason: 'missing-prereq' });
    p.learn('knight.rimBash');
    p.learn('knight.ironStance');
    const before = p.skillPoints;
    expect(p.learn('knight.oathward')).toMatchObject({ ok: true });
    expect(p.skillPoints).toBe(before - 2);
    expect(p.learn('knight.bastionWall')).toEqual({ ok: false, reason: 'unavailable' });
  });
  it('a respec refunds tier 3 in full', () => {
    const { p } = makeProgression();
    p.grantXp(xpForLevel(12), 'x');
    const start = p.skillPoints;
    for (const id of ['knight.rimBash', 'knight.ironStance', 'knight.oathward']) p.learn(id);
    expect(p.skillPoints).toBe(start - 4);
    const release = p.allowRespec('test');
    expect(p.respec()).toMatchObject({ ok: true, refunded: 4 });
    release();
    expect(p.skillPoints).toBe(start);
  });
  it('every tier 4 and 5 skill of every registered class is still unavailable', () => {
    expect(SKILLS.filter((s) => s.tier >= 4).every((s) => !s.available)).toBe(true);
  });
});
