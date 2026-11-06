// Act 4 L7: Wenna's Grisel stock and R21 reader, Wulfhild's Ashwalker bands, Hild's mask rule and Merrin's R20 discount.
import { describe, expect, it } from 'vitest';
import '../gear/tier4/catalog';
import '../items/act4/catalog';
import { getItem } from '../inventory/items';
import '../quests/content/act2/items';
import type { FavourBand } from '../state/favour';
import './items';
import './items.act3';
import { listPrice } from './prices';
import { Shop, type ShopPorts } from './Shop';
import { SHOP_LIST_PRICES, VENDOR_DISCOUNTS, VENDORS, bandAtLeast, stockWhenHolds, type VendorId } from './stock';
import { ACT4_DISCOUNTS, ACT4_FLAGS, HILD, WULFHILD } from './stock.act4';

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

/** A row's lines at a band and flags, the way the Shop filters them (for vendors whose id lands with L0 item 16). */
const linesAt = (row: typeof WULFHILD, band: FavourBand, f: Record<string, unknown> = {}, held: Record<string, number> = {}) =>
  row.lines.filter((l) => (!row.track || bandAtLeast(band, l.from)) && stockWhenHolds(l.when, (k) => f[k]) && !(l.unlessHeld && (held[l.itemId] ?? 0) > 0)).map((l) => l.itemId);

describe('Wenna, the Grisel vendor from M38', () => {
  it('sells Aldous\'s lines by Grisel band, with no warnings', () => {
    const cold = make({ band: 'cold' });
    expect(ids(cold.shop, 'wenna')).toEqual(['healing-flask', 'barley-cake']);
    const hb = make({ band: 'hearthbound' });
    expect(ids(hb.shop, 'wenna')).toEqual(['healing-flask', 'barley-cake', 'iron-ore', 'coal', 'lamp-oil', 'cooling-draught', 'grisel-oath-sash', 'deepcore-pick']);
    expect(cold.w.warnings).toEqual([]);
    expect(hb.w.warnings).toEqual([]);
    expect(VENDORS.wenna.track).toBe('grisel');
  });
  it('R21 all adds cinder-steel and rime-iron at every band; leaders and unset do not', () => {
    const all = ids(make({ band: 'cold', flags: { [ACT4_FLAGS.r21.key]: 'all' } }).shop, 'wenna');
    expect(all).toContain('cinder-steel-ingot');
    expect(all).toContain('rime-iron');
    for (const v of ['leaders', undefined]) {
      const got = ids(make({ band: 'hearthbound', flags: { [ACT4_FLAGS.r21.key]: v } }).shop, 'wenna');
      expect(got).not.toContain('cinder-steel-ingot');
      expect(got).not.toContain('rime-iron');
    }
  });
  it('the R21 reader re-derives when the flag changes (a load is a flag read at quote time)', () => {
    const f: Record<string, unknown> = {};
    const t = make({ band: 'cold', flags: f });
    expect(ids(t.shop, 'wenna')).not.toContain('rime-iron');
    f[ACT4_FLAGS.r21.key] = 'all';
    expect(ids(t.shop, 'wenna')).toContain('rime-iron');
  });
  it('does not resell a unique the player bought from Aldous', () => {
    const t = make({ band: 'hearthbound', held: { 'deepcore-pick': 1, 'grisel-oath-sash': 1 } });
    expect(ids(t.shop, 'wenna')).not.toContain('deepcore-pick');
    expect(ids(t.shop, 'wenna')).not.toContain('grisel-oath-sash');
  });
  it('one line per item', () => {
    const its = VENDORS.wenna.lines.map((l) => l.itemId);
    expect(new Set(its).size).toBe(its.length);
  });
});

describe('Wulfhild, the Ashwalker vendor from M43', () => {
  it('stocks basic, full, rare and master by band', () => {
    expect(linesAt(WULFHILD, 'cold')).toEqual(['healing-flask', 'rain-flask', 'rope']);
    expect(linesAt(WULFHILD, 'banked')).toEqual(['healing-flask', 'rain-flask', 'rope', 'walker-poultice', 'rime-iron', 'wyrm-hide']);
    expect(linesAt(WULFHILD, 'stoked')).toEqual([...linesAt(WULFHILD, 'banked'), 'ash-hide-wraps', 'walker-pyre-paint']);
    expect(linesAt(WULFHILD, 'hearthbound')).toEqual([...linesAt(WULFHILD, 'stoked'), 'walker-pyre-cloak']);
    expect(WULFHILD.track).toBe('ashwalkers');
  });
  it('every line is a registered, priced item', () => {
    for (const l of [...WULFHILD.lines, ...HILD.lines]) {
      expect(getItem(l.itemId), l.itemId).toBeDefined();
      expect(SHOP_LIST_PRICES[l.itemId] ?? listPrice(l.itemId), l.itemId).toBeDefined();
    }
  });
  it('the unique and the pyre-paint are not resold to a holder', () => {
    expect(linesAt(WULFHILD, 'hearthbound', {}, { 'walker-pyre-cloak': 1, 'walker-pyre-paint': 1 })).not.toContain('walker-pyre-cloak');
  });
});

describe('Hild at Ashgate', () => {
  it('sells Rain Flasks and rope; the mask only after M42 and only to a player without one', () => {
    expect(linesAt(HILD, 'cold')).toEqual(['rain-flask', 'rope', 'healing-flask']);
    expect(linesAt(HILD, 'cold', { [ACT4_FLAGS.m42Complete]: true })).toContain('ash-shroud-mask');
    expect(linesAt(HILD, 'cold', { [ACT4_FLAGS.m42Complete]: true }, { 'ash-shroud-mask': 1 })).not.toContain('ash-shroud-mask');
    expect(HILD.buys).toBe(false);
  });
});

describe("Merrin's R20 discount", () => {
  const price = (choice: unknown) => make({ band: 'banked', flags: { 'story.m08.favourTab': true, [ACT4_FLAGS.r20.key]: choice } }).shop.quote('merrin', 'healing-flask');
  it('bribe 15%, stealth 10%, force and unset none', () => {
    const base = price(undefined)!;
    expect(base).toBe(30);
    expect(price('bribe')).toBe(Math.round(30 * 0.85));
    expect(price('stealth')).toBe(27);
    expect(price('force')).toBe(30);
  });
  it('touches only Merrin', () => {
    for (const d of ACT4_DISCOUNTS) expect(d.vendors).toEqual(['merrin']);
    expect(VENDOR_DISCOUNTS).toEqual(expect.arrayContaining([...ACT4_DISCOUNTS]));
    expect(make({ flags: { [ACT4_FLAGS.r20.key]: 'bribe' } }).shop.quote('wystan', 'healing-flask')).toBe(30);
  });
});

describe('Wulfhild and Hild through the real Shop', () => {
  it('are in VENDORS and sell with no warnings', () => {
    expect(VENDORS.wulfhild).toBe(WULFHILD);
    expect(VENDORS.hild).toBe(HILD);
    const w = make({ band: 'hearthbound', flags: { [ACT4_FLAGS.m42Complete]: true } });
    expect(ids(w.shop, 'wulfhild')).toEqual(linesAt(WULFHILD, 'hearthbound'));
    expect(ids(w.shop, 'hild')).toEqual(['rain-flask', 'rope', 'healing-flask', 'ash-shroud-mask']);
    expect(w.w.warnings).toEqual([]);
  });
  it('a Rain Flask costs 14 at Hild and 17 at Wulfhild on Cold (+20%)', () => {
    expect(make({ band: 'cold' }).shop.quote('hild', 'rain-flask')).toBe(14);
    expect(make({ band: 'cold' }).shop.quote('wulfhild', 'rain-flask')).toBe(17);
  });
  it('buying the limited Pyre-Cloak once empties it; the mask cannot be sold back', () => {
    const t = make({ band: 'hearthbound', flags: { [ACT4_FLAGS.m42Complete]: true } });
    expect(t.shop.buy('wulfhild', 'walker-pyre-cloak').ok).toBe(true);
    expect(ids(t.shop, 'wulfhild')).not.toContain('walker-pyre-cloak');
    expect(t.shop.buy('hild', 'ash-shroud-mask').ok).toBe(true);
    expect(t.shop.sell('wulfhild', 'ash-shroud-mask').ok).toBe(false);
  });
});
