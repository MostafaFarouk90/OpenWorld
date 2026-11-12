// G3 New Game+: Heat (design 12.5) and the level-40 lift.
import { describe, expect, it } from 'vitest';
import { Actor } from '../actors/Actor';
import { heatMultiplier, secondHearthHeat } from '../cinderlands/heat';
import { scaleStats } from '../enemies/level';
import { damageLift, healthLift, NGPLUS_DAMAGE_ORDER, scales, SecondHearthScaling } from './scaling';
import { MODIFIER_BANDS } from '../actors/DamageResolver';

const actor = (over: Partial<ConstructorParameters<typeof Actor>[1]> = {}) =>
  new Actor(`a${Math.random()}`, { kind: 'wraith', team: 'hostile', level: 5, maxHealth: 100, ...over } as never);

describe('Second Hearth Heat (design 12.5)', () => {
  it('cycle k at Warmth Tier W runs at 1 + 2k + W, with the 12.4 multiplier', () => {
    expect(secondHearthHeat(1, 0)).toBe(3);
    expect(heatMultiplier(3)).toBeCloseTo(1.16);
    expect(secondHearthHeat(1, 7)).toBe(10);
    expect(heatMultiplier(10)).toBeCloseTo(1.72);
    expect(secondHearthHeat(2, 0)).toBe(5);
    expect(secondHearthHeat(2, 7)).toBe(12);
    expect(secondHearthHeat(1, 99)).toBe(11);
    expect(heatMultiplier(Number.NaN)).toBe(1);
    expect(heatMultiplier(0)).toBe(1);
  });
});

describe('the level-40 lift', () => {
  it('lifts health and damage onto the enemy curve at 40, never down', () => {
    const def = { maxHealth: 100 } as never;
    expect(scaleStats(def, 5).maxHealth * healthLift(5)).toBeCloseTo(scaleStats(def, 40).maxHealth, 0);
    expect(damageLift(5) * scaleStats(def, 5).damageScale).toBeCloseTo(scaleStats(def, 40).damageScale);
    expect(healthLift(40)).toBe(1);
    expect(healthLift(45)).toBe(1);
    expect(damageLift(Number.NaN)).toBeCloseTo(damageLift(1));
  });

  it('scales hostile mortal fighters only (an unhittable boss intro counts; an objective cart does not)', () => {
    expect(scales(actor())).toBe(true);
    expect(scales(actor({ hittable: false }))).toBe(true);
    expect(scales(actor({ team: 'neutral' }))).toBe(false);
    expect(scales(actor({ immortal: true }))).toBe(false);
    expect(scales(actor({ kind: 'brazier-cart' }))).toBe(false);
    expect(scales(actor({ team: 'ally' }))).toBe(false);
  });

  it('a spawn: health to level 40 times the Heat, the health fraction kept, level shown as 40', () => {
    let mult = 1.16;
    const s = new SecondHearthScaling(() => mult);
    const a = actor({ level: 9, maxHealth: 900 });
    a.health = 450;
    s.spawned(a);
    expect(a.maxHealth).toBe(Math.round(900 * healthLift(9) * 1.16));
    expect(a.health).toBe(Math.round(a.maxHealth / 2));
    expect(a.level).toBe(40);
    expect(s.levelAtSpawn(a.id)).toBe(9);
    // the hit: lifted from level 9, at the Heat of the moment
    mult = 1.72;
    const req = { amount: 10, kind: 'melee' } as never as { amount: number; kind: string };
    s.modify(req as never, actor(), a);
    expect(req.amount).toBeCloseTo(10 * damageLift(9) * 1.72);
    const tick = { amount: 10, kind: 'status' };
    s.modify(tick as never, actor(), a);
    expect(tick.amount).toBe(10);
    s.despawned(a.id);
    const after = { amount: 10, kind: 'melee' };
    s.modify(after as never, actor(), a);
    expect(after.amount).toBe(10);
  });

  it('failure: an unscaled actor and an attacker-less hit are untouched', () => {
    const s = new SecondHearthScaling(() => 2);
    const cart = actor({ kind: 'brazier-cart', maxHealth: 600 });
    s.spawned(cart);
    expect(cart.maxHealth).toBe(600);
    const req = { amount: 10, kind: 'melee' };
    s.modify(req as never, actor(), null);
    s.modify(req as never, actor(), cart);
    expect(req.amount).toBe(10);
  });

  it('the damage modifier sits after the enemies\' own (-150), inside the attacker band', () => {
    expect(NGPLUS_DAMAGE_ORDER).toBeGreaterThan(-150);
    expect(NGPLUS_DAMAGE_ORDER).toBeGreaterThanOrEqual(MODIFIER_BANDS.attacker[0]);
    expect(NGPLUS_DAMAGE_ORDER).toBeLessThanOrEqual(MODIFIER_BANDS.attacker[1]);
  });
});
