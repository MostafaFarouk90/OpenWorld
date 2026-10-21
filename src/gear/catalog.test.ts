import { describe, expect, it } from 'vitest';
import '../economy/items';
import { LIST_PRICES, listPrice } from '../economy/prices';
import { ITEMS, getItem } from '../inventory/items';
import { GEAR_ITEMS, GEAR_ROWS, OTHER_ITEMS } from './catalog';
import { FORGE_RECIPES } from './forge';
import { GEAR_STRINGS_EN } from './strings.en';
import { tierOf } from './tempering';

describe('gear catalog', () => {
  it('has 22 rows with unique ids, all registered', () => {
    expect(GEAR_ROWS).toHaveLength(22);
    expect(new Set(GEAR_ROWS.map((r) => r.id)).size).toBe(22);
    for (const r of GEAR_ROWS) expect(getItem(r.id)).toBe(GEAR_ITEMS.find((d) => d.id === r.id));
  });

  it('sets slot, kind and tier per row', () => {
    for (const r of GEAR_ROWS) {
      const d = getItem(r.id)!;
      expect(d.slot).toBe(r.slot);
      expect(d.kind).toBe(r.slot);
      expect(d.gearTier).toBe(r.tier);
      expect(tierOf(d)).toBe(r.tier);
      expect(d.stats?.[r.slot === 'weapon' ? 'attack' : 'defense']).toBe(r.stat);
    }
    expect(GEAR_ROWS.filter((r) => r.classes[0] === 'knight')).toHaveLength(6);
  });

  it('is strictly above every Act 1 item of the slot', () => {
    const act1 = Object.values(ITEMS).filter((d) => d.gearTier === undefined && d.slot && d.slot !== 'trinket');
    expect(act1.map((d) => d.id)).toContain('marshals-longsword');
    expect(act1.length).toBeGreaterThan(15);
    for (const r of GEAR_ROWS) {
      for (const a of act1.filter((d) => d.slot === r.slot && tierOf(d) === 1)) {
        const stat = r.slot === 'weapon' ? a.stats?.attack : a.stats?.defense;
        expect(r.stat, `${r.id} vs ${a.id}`).toBeGreaterThan(stat ?? 0);
      }
    }
  });

  it('puts tier 3 above tier 2 in every forge pair', () => {
    expect(Object.keys(FORGE_RECIPES)).toHaveLength(11);
    for (const [from, to] of Object.entries(FORGE_RECIPES)) {
      const a = GEAR_ROWS.find((r) => r.id === from)!;
      const b = GEAR_ROWS.find((r) => r.id === to)!;
      expect([a.tier, b.tier]).toEqual([2, 3]);
      expect(a.slot).toBe(b.slot);
      expect(b.stat).toBeGreaterThan(a.stat);
      expect(b.classes).toEqual(a.classes);
    }
  });

  it('has names, descriptions and the agreed prices', () => {
    for (const d of [...GEAR_ITEMS, ...OTHER_ITEMS]) {
      expect(GEAR_STRINGS_EN[d.nameKey], d.id).toBeTruthy();
      expect(GEAR_STRINGS_EN[d.descKey], d.id).toBeTruthy();
    }
    const t2: Record<string, number> = { 'halvard-steel-blade': 240, 'rectangle-shield': 140, brigandine: 190, 'stonefold-greataxe': 250, 'fur-lined-mail': 170, 'archive-wand-of-oswin': 230, 'scholars-robe': 160, 'guild-twin-daggers': 230, 'couriers-coat': 170, 'greywatch-crossbow': 250, 'fen-leathers': 160 };
    for (const [id, p] of Object.entries(t2)) expect(listPrice(id)).toBe(p);
    for (const r of GEAR_ROWS.filter((r) => r.tier === 3)) expect(listPrice(r.id)).toBe(r.slot === 'weapon' ? 600 : r.slot === 'armour' ? 450 : 400);
  });

  it('registers the other items without pricing them here', () => {
    expect(OTHER_ITEMS).toHaveLength(12);
    for (const d of OTHER_ITEMS) {
      expect(ITEMS[d.id]).toBe(d);
    }
    expect(getItem('iron-ore')!.stackMax).toBe(40);
    expect(getItem('cinder-steel-ingot')!.stackMax).toBe(20);
    expect(getItem('maud-stew')!.use?.healFlat).toBe(35);
    expect(getItem('maud-poultice')!.use?.healFraction).toBe(0.5);
    expect(getItem('ketta-wool-cloak')!.stats?.defense).toBe(2);
    expect(LIST_PRICES['ashmare-saddle']).toBeUndefined();
  });
});
