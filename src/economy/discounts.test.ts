import { describe, expect, it } from 'vitest';
import type { ItemDef } from '../hud/ports';
import { Shop, type ShopPorts } from './Shop';
import { discountPercent, VENDORS, VENDOR_DISCOUNTS, VENDOR_IDS, type VendorDiscount } from './stock';

const item = (id: string): ItemDef => ({ id, nameKey: id, descKey: id, kind: 'consumable', stackMax: 10 });

function shopWith(flags: Record<string, unknown>, discounts?: readonly VendorDiscount[], withFlag = true) {
  const warnings: string[] = [];
  const ports: ShopPorts = {
    gold: () => 1000,
    takeGold: (n) => n,
    addGold: () => {},
    count: () => 0,
    remove: () => true,
    isEquipped: () => false,
    getItem: item,
    grant: () => {},
    band: () => null,
    isOpen: () => true,
    emit: () => {},
    warn: (m) => void warnings.push(m),
    ...(withFlag ? { flag: (k: string) => flags[k] } : {}),
    discounts,
  };
  return { shop: new Shop(ports), warnings };
}

const TABLE: VendorDiscount[] = [
  { flag: 'story.r09.choice', value: 'smith', vendors: ['edda'], percent: 10 },
  { flag: 'story.r10.choice', vendors: ['edda', 'wynn'], percent: 25 },
];

describe('vendor discounts', () => {
  it('ships an empty table that changes nothing', () => {
    expect(VENDOR_DISCOUNTS).toEqual([]);
    const { shop } = shopWith({ 'story.r10.choice': 'x' });
    expect(shop.quote('edda', 'barley-cake')).toBe(6);
  });

  it('applies only when the flag (and value) match', () => {
    expect(shopWith({}, TABLE).shop.quote('edda', 'barley-cake')).toBe(6);
    expect(shopWith({ 'story.r09.choice': 'other' }, TABLE).shop.quote('edda', 'barley-cake')).toBe(6);
    expect(shopWith({ 'story.r09.choice': 'smith' }, TABLE).shop.quote('edda', 'barley-cake')).toBe(5);
    expect(shopWith({ 'story.r10.choice': 'anything' }, TABLE).shop.quote('wynn', 'barley-cake')).toBe(5);
  });

  it('takes the best match, only for listed vendors, and never below 1 gold', () => {
    const both = { 'story.r09.choice': 'smith', 'story.r10.choice': 'y' };
    expect(shopWith(both, TABLE).shop.quote('edda', 'barley-cake')).toBe(5);
    expect(discountPercent('edda', (k) => both[k as keyof typeof both], TABLE)).toBe(25);
    expect(discountPercent('dunstan', (k) => both[k as keyof typeof both], TABLE)).toBe(0);
    const full: VendorDiscount[] = [{ flag: 'f', vendors: ['edda'], percent: 100 }];
    expect(shopWith({ f: true }, full).shop.quote('edda', 'barley-cake')).toBe(1);
  });

  it('is off without a flag port, and a bought line charges the discounted price', () => {
    expect(shopWith({ 'story.r10.choice': 1 }, TABLE, false).shop.quote('edda', 'barley-cake')).toBe(6);
    const { shop } = shopWith({ 'story.r10.choice': 1 }, TABLE);
    expect(shop.buy('edda', 'barley-cake', 2)).toEqual({ ok: true, total: 10 });
  });
});

describe('Act 2 vendors', () => {
  it('are in the full record with empty lines', () => {
    for (const id of ['aldous', 'wenna', 'slagg', 'pike', 'ketta', 'maud', 'osgar'] as const) {
      expect(VENDORS[id].id).toBe(id);
      expect(VENDORS[id].lines).toEqual([]);
      expect(VENDOR_IDS).toContain(id);
    }
  });

  it('load an Act 1 vendors save that only knows the old vendors', () => {
    const fixtures = import.meta.glob('../save/__fixtures__/act1-*.json', { eager: true, import: 'default' }) as Record<string, any>;
    let checked = 0;
    for (const [f, save] of Object.entries(fixtures)) {
      const entry = save?.entries?.vendors;
      if (!entry) continue;
      const { shop, warnings } = shopWith({});
      shop.load(entry.data, entry.version);
      expect(warnings, f).toEqual([]);
      expect(Object.keys(shop.serialize().stock)).toEqual(expect.arrayContaining(['wystan', 'aldous']));
      checked++;
    }
    expect(checked).toBeGreaterThan(0);
  });
});
