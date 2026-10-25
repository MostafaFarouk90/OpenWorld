import { describe, expect, it } from 'vitest';
import '../gear/tier4/catalog';
import { getItem } from '../inventory/items';
import '../quests/content/act2/items';
import type { FavourBand } from '../state/favour';
import './items.act3';
import { ACT3_ITEMS } from './items.act3';
import { listPrice } from './prices';
import { Shop, type ShopPorts } from './Shop';
import { ACT3_DISCOUNTS, ACT3_FLAGS } from './stock.act3';
import { ECONOMY_ACT3_STRINGS_EN } from './strings.act3.en';
import { SHOP_LIST_PRICES, VENDOR_DISCOUNTS, VENDORS, type VendorId } from './stock';

interface Opts {
  flags?: Record<string, unknown>;
  band?: FavourBand;
  held?: Record<string, number>;
}
function make(o: Opts = {}) {
  const w = { gold: 50000, items: new Map<string, number>(Object.entries(o.held ?? {})), warnings: [] as string[] };
  const ports: ShopPorts = {
    gold: () => w.gold,
    takeGold: (n) => ((w.gold -= n), n),
    addGold: (n) => void (w.gold += n),
    count: (id) => w.items.get(id) ?? 0,
    remove: (id, n) => {
      const h = w.items.get(id) ?? 0;
      if (h < n) return false;
      w.items.set(id, h - n);
      return true;
    },
    isEquipped: () => false,
    getItem,
    grant: (_s, id, n) => void w.items.set(id, (w.items.get(id) ?? 0) + n),
    band: () => o.band ?? null,
    isOpen: () => true,
    emit: () => {},
    warn: (m) => void w.warnings.push(m),
    flag: (k) => o.flags?.[k],
    gearRecord: () => ({ temper: 0 }),
  };
  return { shop: new Shop(ports), w };
}
const ids = (shop: Shop, v: VendorId) => shop.offers(v).map((x) => x.itemId);

describe('Act 3 vendor stock, no flags', () => {
  it('lists each vendor base lines with no warnings (every item registered and priced)', () => {
    const { shop, w } = make();
    expect(ids(shop, 'leofa')).toEqual(['crossbow-bolts']);
    expect(ids(shop, 'dudda')).toEqual(['fishing-bait', 'fishing-tackle', 'key.ferry-token']);
    expect(ids(shop, 'gytha')).toEqual(['healing-flask', 'cooling-draught', 'bog-myrtle', 'sundew', 'mire-lily']);
    expect(ids(shop, 'thorgar')).toEqual(['rime-cloak', 'cliff-crampons', 'rope', 'hawk-jerky', 'rime-iron', 'wyrm-hide', 'shed-wyrm-scale']);
    expect(ids(shop, 'eadgyth')).toEqual(['hunting-knife']);
    expect(ids(shop, 'ansgar')).toEqual(['monastery-candle']);
    expect(ids(shop, 'ysmeryth')).toEqual([]);
    expect(w.warnings).toEqual([]);
  });

  it('only thorgar buys', () => {
    for (const id of ['leofa', 'dudda', 'gytha', 'eadgyth', 'ansgar', 'ysmeryth'] as const) expect(VENDORS[id].buys, id).toBe(false);
    expect(VENDORS.thorgar.buys).toBe(true);
  });

  it('every new item has strings, a price and the specified shape', () => {
    for (const d of ACT3_ITEMS) {
      expect(ECONOMY_ACT3_STRINGS_EN[d.nameKey], d.id).toBeTruthy();
      expect(ECONOMY_ACT3_STRINGS_EN[d.descKey], d.id).toBeTruthy();
      expect(getItem(d.id)).toBe(d);
    }
    for (const id of ['master-bolts']) expect(ECONOMY_ACT3_STRINGS_EN[`item.${id}.name`]).toBeTruthy();
    expect(getItem('master-bolts')).toMatchObject({ kind: 'quest', stackMax: 40 });
    expect(SHOP_LIST_PRICES['master-bolts']).toBe(6);
    expect(getItem('fen-salve')).toMatchObject({ kind: 'consumable', stackMax: 5, use: { noHeal: true, burnRelief: 20 } });
    for (const [id, n] of [['fishing-bait', 20], ['fishing-tackle', 1], ['rope', 5], ['hawk-jerky', 10], ['monastery-candle', 10], ['bog-myrtle', 10], ['sundew', 10], ['mire-lily', 10], ['reed-basket', 10]] as const) {
      expect(getItem(id), id).toMatchObject({ kind: 'quest', stackMax: n });
    }
    for (const v of ['leofa', 'dudda', 'gytha', 'thorgar', 'eadgyth', 'ansgar', 'ysmeryth']) expect(ECONOMY_ACT3_STRINGS_EN[`economy.shop.title.${v}`]).toBeTruthy();
  });

  it('every Act 3 line has a price', () => {
    for (const v of ['leofa', 'dudda', 'gytha', 'thorgar', 'eadgyth', 'ansgar', 'ysmeryth'] as const) {
      for (const l of VENDORS[v].lines) expect(SHOP_LIST_PRICES[l.itemId] ?? listPrice(l.itemId), `${v}:${l.itemId}`).toBeGreaterThan(0);
    }
  });
});

describe('Act 3 flag values (each fails if the value is renamed)', () => {
  it('leofa sells master bolts only when r14 is "returned"', () => {
    expect(ACT3_FLAGS.r14).toEqual({ key: 'story.r14.choice', returned: 'returned' });
    expect(ids(make({ flags: { 'story.r14.choice': 'returned' } }).shop, 'leofa')).toEqual(['crossbow-bolts', 'master-bolts']);
    expect(ids(make({ flags: { 'story.r14.choice': 'released' } }).shop, 'leofa')).toEqual(['crossbow-bolts']);
    expect(ids(make().shop, 'leofa')).toEqual(['crossbow-bolts']);
    expect(make({ flags: { 'story.r14.choice': 'returned' } }).shop.quote('leofa', 'master-bolts')).toBe(6);
  });

  it('dudda sells reed baskets only when r12 is "cut"', () => {
    expect(ACT3_FLAGS.r12).toEqual({ key: 'story.r12.choice', cut: 'cut' });
    expect(ids(make({ flags: { 'story.r12.choice': 'cut' } }).shop, 'dudda')).toContain('reed-basket');
    expect(ids(make({ flags: { 'story.r12.choice': 'burned' } }).shop, 'dudda')).not.toContain('reed-basket');
    expect(ids(make().shop, 'dudda')).not.toContain('reed-basket');
  });

  it('thorgar is 15% off only when r15 is "lodge"', () => {
    expect(ACT3_FLAGS.r15).toEqual({ key: 'story.r15.choice', lodge: 'lodge' });
    const rope = (flags: Record<string, unknown>) => make({ flags }).shop.quote('thorgar', 'rime-iron');
    expect(rope({})).toBe(80);
    expect(rope({ 'story.r15.choice': 'hut' })).toBe(80);
    expect(rope({ 'story.r15.choice': 'lodge' })).toBe(68);
    expect(make({ flags: { 'story.r15.choice': 'lodge' } }).shop.quote('leofa', 'crossbow-bolts')).toBe(2);
    expect(VENDOR_DISCOUNTS).toEqual(expect.arrayContaining([...ACT3_DISCOUNTS]));
    expect(ACT3_DISCOUNTS.every((d) => d.vendors.length === 1 && d.vendors[0] === 'thorgar')).toBe(true);
  });

  it('gytha sells the salve once m25 is complete', () => {
    expect(ACT3_FLAGS.m25Complete).toBe('story.m25.complete');
    expect(ids(make({ flags: { 'story.m25.complete': true } }).shop, 'gytha')).toContain('fen-salve');
    expect(ids(make().shop, 'gytha')).not.toContain('fen-salve');
  });

  it('a flag flipped across a reset and load is read live', () => {
    const flags: Record<string, unknown> = {};
    const { shop } = make({ flags });
    expect(ids(shop, 'leofa')).toEqual(['crossbow-bolts']);
    flags['story.r14.choice'] = 'returned';
    shop.load(JSON.parse(JSON.stringify(shop.serialize())), 1);
    expect(ids(shop, 'leofa')).toContain('master-bolts');
  });
});

describe('dudda ferry token (unlessHeld)', () => {
  it('is offered while not held, hidden and refused while held, offered again after it is gone', () => {
    const { shop, w } = make();
    expect(shop.buy('dudda', 'key.ferry-token')).toEqual({ ok: true, total: 20 });
    expect(w.items.get('key.ferry-token')).toBe(1);
    expect(ids(shop, 'dudda')).not.toContain('key.ferry-token');
    expect(shop.buy('dudda', 'key.ferry-token')).toEqual({ ok: false, reason: 'not-stocked' });
    w.items.set('key.ferry-token', 0);
    expect(ids(shop, 'dudda')).toContain('key.ferry-token');
  });
  it('a token held from a quest hides the line from the start', () => {
    expect(ids(make({ held: { 'key.ferry-token': 1 } }).shop, 'dudda')).not.toContain('key.ferry-token');
  });
  it('a key item cannot be sold back', () => {
    expect(make({ held: { 'key.ferry-token': 1 } }).shop.sell('thorgar', 'key.ferry-token')).toEqual({ ok: false, reason: 'cannot-sell' });
  });
});

describe('ysmeryth and the dragons track', () => {
  const flags = { 'story.m32.complete': true };
  const by = (b: FavourBand, f: Record<string, unknown> = flags) => ids(make({ band: b, flags: f }).shop, 'ysmeryth');
  it('the lines follow the band', () => {
    expect(by('cold')).toEqual(['shed-wyrm-scale', 'wyrm-hide']);
    expect(by('banked')).toEqual(['shed-wyrm-scale', 'wyrm-hide', 'rime-iron']);
    expect(by('stoked')).toEqual(['shed-wyrm-scale', 'wyrm-hide', 'rime-iron', 'keepers-scale-brooch']);
    expect(by('hearthbound')).toEqual(['shed-wyrm-scale', 'wyrm-hide', 'rime-iron', 'keepers-scale-brooch', 'ember-mothers-scale']);
  });
  it('shows nothing until story.m32.complete, at any band', () => {
    for (const b of ['cold', 'banked', 'stoked', 'hearthbound'] as const) expect(by(b, {})).toEqual([]);
    expect(by('hearthbound', { 'story.m32.complete': false })).toEqual([]);
  });
  it('prices follow the band (cold +20%, hearthbound -20%) and the unique items are limited to one', () => {
    expect(make({ band: 'cold', flags }).shop.quote('ysmeryth', 'wyrm-hide')).toBe(54);
    expect(make({ band: 'hearthbound', flags }).shop.quote('ysmeryth', 'wyrm-hide')).toBe(36);
    const { shop } = make({ band: 'hearthbound', flags });
    expect(shop.offers('ysmeryth').find((o) => o.itemId === 'ember-mothers-scale')).toMatchObject({ remaining: 1, price: 720 });
    expect(shop.buy('ysmeryth', 'ember-mothers-scale').ok).toBe(true);
    expect(shop.buy('ysmeryth', 'ember-mothers-scale')).toEqual({ ok: false, reason: 'out-of-stock' });
    expect(VENDORS.ysmeryth.track).toBe('dragons');
  });
  it('the story flag name is pinned', () => {
    expect(ACT3_FLAGS.m32Complete).toBe('story.m32.complete');
  });
});

describe("thorgar's nine shed scales", () => {
  it('are limited, never restock, and survive a Shop save and load', () => {
    const a = make();
    expect(a.shop.offers('thorgar').find((o) => o.itemId === 'shed-wyrm-scale')!.remaining).toBe(9);
    expect(a.shop.buy('thorgar', 'shed-wyrm-scale', 4).ok).toBe(true);
    const saved = JSON.parse(JSON.stringify(a.shop.serialize()));
    const b = make();
    b.shop.load(saved, 1);
    expect(b.shop.offers('thorgar').find((o) => o.itemId === 'shed-wyrm-scale')!.remaining).toBe(5);
    expect(b.shop.buy('thorgar', 'shed-wyrm-scale', 6)).toEqual({ ok: false, reason: 'out-of-stock' });
    expect(b.shop.buy('thorgar', 'shed-wyrm-scale', 5).ok).toBe(true);
    expect(b.shop.buy('thorgar', 'shed-wyrm-scale')).toEqual({ ok: false, reason: 'out-of-stock' });
    expect(b.w.warnings).toEqual([]);
  });
  it('wyrm hide is unlimited', () => {
    const { shop } = make();
    expect(shop.offers('thorgar').find((o) => o.itemId === 'wyrm-hide')!.remaining).toBeNull();
  });
});
