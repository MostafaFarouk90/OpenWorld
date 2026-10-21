import { describe, expect, it } from 'vitest';
import { Inventory } from '../inventory/Inventory';
import { FORGE_RECIPES, forgeCost, forgeItem } from './forge';
import { checkTemper, effectiveStats, firstTemperOfTier, isTemperable, temperCost, temperItem, tierOf } from './tempering';
import { testInventory } from './testkit';
import { getItem } from '../inventory/items';

describe('temperCost', () => {
  it('follows the tier table to +5', () => {
    expect(temperCost(1, 1)).toEqual({ gold: 15, materials: [] });
    expect(temperCost(2, 3)).toEqual({ gold: 120, materials: [{ itemId: 'iron-ore', count: 1 }, { itemId: 'coal', count: 1 }] });
    expect(temperCost(3, 5)).toEqual({ gold: 450, materials: [{ itemId: 'cinder-steel-ingot', count: 1 }] });
    const total = (tier: number) => [1, 2, 3, 4, 5].reduce((s, l) => s + temperCost(tier, l)!.gold, 0);
    expect(total(2)).toBe(600);
    expect(total(3)).toBe(1350);
  });
  it('refuses levels outside 1..5', () => {
    for (const l of [0, 6, -1, 1.5, NaN]) expect(temperCost(2, l)).toBeNull();
  });
});

describe('tier and stats', () => {
  it('reads tier as gearTier ?? 1', () => {
    expect(tierOf(getItem('practice-sword'))).toBe(1);
    expect(tierOf(getItem('halvard-steel-blade'))).toBe(2);
    expect(tierOf(getItem('ashplate'))).toBe(3);
    expect(tierOf(undefined)).toBe(1);
  });
  it('scales effective stats 5% a level, rounded', () => {
    expect(effectiveStats('ashforged-longsword', 0)).toEqual({ attack: 34 });
    expect(effectiveStats('ashforged-longsword', 1)).toEqual({ attack: 36 });
    expect(effectiveStats('ashforged-longsword', 5)).toEqual({ attack: 43 });
    expect(effectiveStats('ashplate', 5)).toEqual({ defense: 18 });
    expect(effectiveStats('practice-sword', 3)).toEqual({ attack: 9 });
    expect(effectiveStats('practice-sword', 99)).toEqual({ attack: 10 }); // clamped to +5
    expect(effectiveStats('nope', 2)).toEqual({});
  });
  it('lets tier 1 pieces be tempered but not trinkets or consumables', () => {
    expect(isTemperable(getItem('practice-sword'))).toBe(true);
    expect(isTemperable(getItem('wooden-round-shield'))).toBe(true);
    expect(isTemperable(getItem('hearth-stone-charm'))).toBe(false);
    expect(isTemperable(getItem('healing-flask'))).toBe(false);
    expect(isTemperable(undefined)).toBe(false);
  });
  it('knows the first temper of a tier', () => {
    expect(firstTemperOfTier([], 2)).toBe(true);
    expect(firstTemperOfTier([2], 2)).toBe(false);
    expect(firstTemperOfTier([2], 3)).toBe(true);
  });
});

describe('temperItem', () => {
  it('tempers a tier 1 piece for gold only, with reason script', () => {
    const inv = testInventory({ 'practice-sword': 1 }, 100);
    expect(temperItem(inv, 'practice-sword')).toEqual({ ok: true, level: 1 });
    expect(inv.gold).toBe(85);
    expect(inv.spent).toEqual([{ amount: 15, reason: 'script' }]);
    expect(inv.gear('practice-sword').temper).toBe(1);
  });
  it('takes tier 2 materials and tier 3 ingots per level', () => {
    const inv = testInventory({ 'halvard-steel-blade': 1, 'iron-ore': 3, coal: 3, 'ashplate': 1, 'cinder-steel-ingot': 2 }, 1000);
    expect(temperItem(inv, 'halvard-steel-blade').ok).toBe(true);
    expect(inv.count('iron-ore')).toBe(2);
    expect(inv.count('coal')).toBe(2);
    expect(inv.gold).toBe(960);
    expect(temperItem(inv, 'ashplate', { affix: 'ember' })).toEqual({ ok: true, level: 1, affix: 'ember' });
    expect(inv.count('cinder-steel-ingot')).toBe(1);
    expect(inv.gear('ashplate')).toEqual({ temper: 1, affix: 'ember' });
  });
  it('caps at +5 and takes nothing at the cap', () => {
    const inv = testInventory({ 'practice-sword': 1 }, 1000);
    for (let i = 0; i < 5; i++) expect(temperItem(inv, 'practice-sword').ok).toBe(true);
    const gold = inv.gold;
    expect(temperItem(inv, 'practice-sword')).toEqual({ ok: false, reason: 'at-cap' });
    expect(inv.gold).toBe(gold);
    expect(inv.gear('practice-sword').temper).toBe(5);
  });
  it('refuses cleanly and takes nothing', () => {
    const inv = testInventory({ 'halvard-steel-blade': 1, 'iron-ore': 1, 'hearth-stone-charm': 1, 'practice-sword': 1 }, 100);
    const snap = () => JSON.stringify([inv.gold, inv.raw.serialize()]);
    const before = snap();
    expect(temperItem(inv, 'halvard-steel-blade')).toEqual({ ok: false, reason: 'no-materials' }); // coal missing
    expect(temperItem(inv, 'ashplate')).toEqual({ ok: false, reason: 'not-held' });
    expect(temperItem(inv, 'hearth-stone-charm')).toEqual({ ok: false, reason: 'not-temperable' });
    expect(temperItem(inv, 'ghost')).toEqual({ ok: false, reason: 'unknown-item' });
    expect(snap()).toBe(before);
    const poor = testInventory({ 'practice-sword': 1 }, 14);
    expect(temperItem(poor, 'practice-sword')).toEqual({ ok: false, reason: 'no-gold' });
    expect(poor.gold).toBe(14);
    expect(poor.spent).toEqual([]);
  });
  it('a free lesson run takes nothing but still tempers', () => {
    const inv = testInventory({ 'halvard-steel-blade': 1 }, 0);
    expect(checkTemper(inv, 'halvard-steel-blade')).toBe('no-gold');
    expect(temperItem(inv, 'halvard-steel-blade', { free: true })).toEqual({ ok: true, level: 1 });
    expect(inv.spent).toEqual([]);
  });
  it('keeps an existing affix when none is given', () => {
    const inv = testInventory({ 'practice-sword': 1 }, 100);
    inv.setTemper('practice-sword', 1, 'sworn');
    temperItem(inv, 'practice-sword');
    expect(inv.gear('practice-sword')).toEqual({ temper: 2, affix: 'sworn' });
  });
});

describe('forge', () => {
  it('has 11 recipes costing 1 ingot and 150 gold (weapon) or 120 (armour)', () => {
    expect(Object.keys(FORGE_RECIPES)).toHaveLength(11);
    expect(forgeCost('halvard-steel-blade')).toEqual({ ingots: 1, gold: 150 });
    expect(forgeCost('brigandine')).toEqual({ ingots: 1, gold: 120 });
    expect(forgeCost('rectangle-shield')).toEqual({ ingots: 1, gold: 150 });
    expect(forgeCost('practice-sword')).toBeNull();
  });
  it('turns the piece into its tier 3 form at +0, with no refund', () => {
    const inv = testInventory({ 'halvard-steel-blade': 1, 'cinder-steel-ingot': 2 }, 300);
    inv.setTemper('halvard-steel-blade', 3, 'ember');
    expect(forgeItem(inv, 'halvard-steel-blade')).toEqual({ ok: true, from: 'halvard-steel-blade', to: 'ashforged-longsword' });
    expect(inv.has('halvard-steel-blade')).toBe(false);
    expect(inv.has('ashforged-longsword')).toBe(true);
    expect(inv.gear('ashforged-longsword')).toEqual({ temper: 0 });
    expect(inv.gear('halvard-steel-blade')).toEqual({ temper: 0 });
    expect(inv.count('cinder-steel-ingot')).toBe(1);
    expect(inv.gold).toBe(150);
    expect(inv.spent).toEqual([{ amount: 150, reason: 'script' }]);
  });
  it('swaps in the new piece when the old one was equipped, and only then', () => {
    const a = testInventory({ brigandine: 1, 'cinder-steel-ingot': 1 }, 200);
    a.equip('brigandine');
    forgeItem(a, 'brigandine');
    expect(a.equipped('armour')).toBe('ashplate');
    const b = testInventory({ brigandine: 1, 'cinder-steel-ingot': 1 }, 200);
    forgeItem(b, 'brigandine');
    expect(b.equipped('armour')).toBeNull();
  });
  it('refuses without taking anything', () => {
    const base = { brigandine: 1, 'cinder-steel-ingot': 1 };
    const cases: [ReturnType<typeof testInventory>, string, string][] = [
      [testInventory({ brigandine: 1 }, 500), 'brigandine', 'no-ingot'],
      [testInventory(base, 119), 'brigandine', 'no-gold'],
      [testInventory({ 'cinder-steel-ingot': 1 }, 500), 'brigandine', 'not-held'],
      [testInventory({ 'practice-sword': 1, 'cinder-steel-ingot': 1 }, 500), 'practice-sword', 'no-recipe'],
      [testInventory({ ...base, ashplate: 1 }, 500), 'brigandine', 'owned'],
    ];
    for (const [inv, id, reason] of cases) {
      const before = JSON.stringify([inv.gold, inv.raw.serialize()]);
      expect(forgeItem(inv, id)).toEqual({ ok: false, reason });
      expect(JSON.stringify([inv.gold, inv.raw.serialize()])).toBe(before);
    }
  });
  it('survives a v2 save round trip, and a v1 save loads at +0', () => {
    const inv = testInventory({ 'halvard-steel-blade': 1, 'cinder-steel-ingot': 1, 'practice-sword': 1 }, 400);
    inv.equip('halvard-steel-blade');
    forgeItem(inv, 'halvard-steel-blade');
    temperItem(inv, 'ashforged-longsword', { free: true, affix: 'cinder' });
    const saved = JSON.parse(JSON.stringify(inv.raw.serialize()));
    const other = new Inventory({ emit: () => {}, logger: { warn: () => {} } });
    other.load(saved, Inventory.version);
    expect(other.equipped('weapon')).toBe('ashforged-longsword');
    expect(other.gear('ashforged-longsword')).toEqual({ temper: 1, affix: 'cinder' });
    expect(other.has('halvard-steel-blade')).toBe(false);
    const v1 = { items: { 'ashforged-longsword': 1 }, equipped: {}, unknown: {}, gold: 0 };
    other.load(v1, 1);
    expect(other.gear('ashforged-longsword')).toEqual({ temper: 0 });
  });
});
