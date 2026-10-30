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
  it('ships the Act 2 union table and changes no Act 1 vendor', () => {
    for (const d of VENDOR_DISCOUNTS) expect(d.vendors.every((v) => ['aldous', 'slagg', 'pike', 'thorgar'].includes(v))).toBe(true);
    const { shop } = shopWith({ 'story.r10.choice': 'miners', 'story.r09.choice': 'miners' });
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
  it('are in the full record; wenna (Act 4) stays empty and the rest are stocked', () => {
    for (const id of ['aldous', 'wenna', 'slagg', 'pike', 'ketta', 'maud', 'osgar'] as const) {
      expect(VENDORS[id].id).toBe(id);
      if (id === 'wenna') expect(VENDORS[id].lines).toEqual([]);
      else expect(VENDORS[id].lines.length).toBeGreaterThan(0);
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

describe('Act 3 vendors (v0.7 item 16)', () => {
  it('are in the total record (stock lives in stock.act3.ts)', () => {
    for (const id of ['leofa', 'dudda', 'gytha', 'thorgar', 'eadgyth', 'ansgar', 'ysmeryth'] as const) {
      expect(VENDORS[id]).toMatchObject({ id });
      expect(VENDOR_IDS).toContain(id);
    }
  });

  it('a story.r15.choice row applies to thorgar only when the value matches', () => {
    const table: VendorDiscount[] = [{ flag: 'story.r15.choice', value: 'hut', vendors: ['thorgar'], percent: 10 }];
    expect(discountPercent('thorgar', (k) => ({ 'story.r15.choice': 'hut' })[k as 'story.r15.choice'], table)).toBe(10);
    expect(discountPercent('thorgar', () => 'mere', table)).toBe(0);
    expect(discountPercent('thorgar', () => undefined, table)).toBe(0);
    expect(discountPercent('leofa', () => 'hut', table)).toBe(0);
  });

  it('ships one Act 3 row: thorgar on the r15 lodge choice', () => {
    expect(VENDOR_DISCOUNTS.filter((d) => d.flag === 'story.r15.choice')).toEqual([{ flag: 'story.r15.choice', value: 'lodge', vendors: ['thorgar'], percent: 15 }]);
  });
});
