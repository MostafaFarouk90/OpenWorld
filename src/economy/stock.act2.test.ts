import { describe, expect, it } from 'vitest';
import type { ItemDef } from '../hud/ports';
import type { FavourBand } from '../state/favour';
import { LIST_PRICES, listPrice, sellPrice } from './prices';
import { Shop, type ShopPorts } from './Shop';
import { bandAtLeast, SELL_FLAT, SHOP_LIST_PRICES, VENDOR_DISCOUNTS, VENDORS, VENDOR_IDS, type VendorId } from './stock';

const QUEST = new Set(['iron-ore', 'coal', 'cinder-steel-ingot', 'pickaxe', 'lamp-oil', 'cooling-draught', 'ember-coal']);
const def = (id: string): ItemDef => ({ id, nameKey: id, descKey: id, kind: QUEST.has(id) ? 'quest' : 'consumable', stackMax: 40 });
/** Test prices for gear the gear catalog prices; harmless when the real catalog supplies the same ids. */
const GEAR_PRICES: Record<string, number> = {
  'halvard-steel-blade': 240, 'rectangle-shield': 140, brigandine: 190, 'stonefold-greataxe': 250, 'fur-lined-mail': 170,
  'archive-wand-of-oswin': 230, 'scholars-robe': 160, 'guild-twin-daggers': 230, 'couriers-coat': 170,
  'greywatch-crossbow': 250, 'fen-leathers': 160,
};
for (const [k, v] of Object.entries(GEAR_PRICES)) LIST_PRICES[k] ??= v;

interface Opts {
  flags?: Record<string, unknown>;
  band?: FavourBand;
  open?: boolean;
  gear?: Record<string, { temper: number; affix?: string }>;
}
function make(o: Opts = {}) {
  const w = { gold: 5000, items: new Map<string, number>(), warnings: [] as string[] };
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
    getItem: def,
    grant: (_s, id, n) => void w.items.set(id, (w.items.get(id) ?? 0) + n),
    band: () => o.band ?? null,
    isOpen: () => o.open ?? true,
    emit: () => {},
    warn: (m) => void w.warnings.push(m),
    flag: (k) => o.flags?.[k],
    gearRecord: (id) => o.gear?.[id] ?? { temper: 0 },
  };
  return { shop: new Shop(ports), w };
}
const ids = (shop: Shop, v: VendorId) => shop.offers(v).map((x) => x.itemId);

describe('StockLine when and classes', () => {
  it('Act 1 offers are identical before story.gate.a2, tier 2 appears after', () => {
    const before = make({ band: 'banked' });
    expect(ids(before.shop, 'dunstan')).toEqual(['ember-coal']);
    expect(ids(before.shop, 'gerta')).toEqual(['oswin-lockpicks']);
    expect(ids(before.shop, 'merrin')).not.toContain('archive-wand-of-oswin');
    expect(ids(before.shop, 'merrin')).not.toContain('scholars-robe');
    const after = make({ band: 'banked', flags: { 'story.gate.a2': true } });
    expect(ids(after.shop, 'dunstan')).toEqual(['ember-coal', 'halvard-steel-blade', 'rectangle-shield', 'brigandine', 'stonefold-greataxe', 'fur-lined-mail']);
    expect(ids(after.shop, 'gerta')).toEqual(['oswin-lockpicks', 'guild-twin-daggers', 'couriers-coat']);
    expect(ids(after.shop, 'merrin')).toContain('archive-wand-of-oswin');
    expect(after.shop.quote('dunstan', 'halvard-steel-blade')).toBe(240);
  });

  it('merrin tier 2 starts at banked', () => {
    const cold = make({ band: 'cold', flags: { 'story.gate.a2': true } });
    expect(ids(cold.shop, 'merrin')).not.toContain('scholars-robe');
  });

  it('a line with when and no flag reader is hidden; equals, not and truthy all work', () => {
    const { shop } = make({ flags: {} });
    expect(ids(shop, 'ketta')).toEqual(['ketta-wool-cloak', 'hearth-bread', 'barley-cake']); // unset is not 'fox'
    expect(ids(make({ flags: { 'story.r05.choice': 'safe' } }).shop, 'ketta')).toHaveLength(3);
    expect(ids(make({ flags: { 'story.r05.choice': 'fox' } }).shop, 'ketta')).toEqual(['ketta-wool-cloak']);
  });

  it('exposes classes on the offer, and the sale is not class-locked', () => {
    const { shop, w } = make();
    const o = shop.offers('osgar').find((x) => x.itemId === 'stonefold-greataxe')!;
    expect(o.classes).toEqual(['warden']);
    expect(shop.offers('osgar').find((x) => x.itemId === 'healing-flask')!.classes).toBeUndefined();
    expect(shop.buy('osgar', 'stonefold-greataxe').ok).toBe(true);
    expect(w.items.get('stonefold-greataxe')).toBe(1);
  });

  it('a gated line cannot be bought while hidden', () => {
    expect(make().shop.buy('dunstan', 'brigandine')).toEqual({ ok: false, reason: 'not-stocked' });
  });
});

describe('Act 2 vendor stock', () => {
  it('osgar, maud, pike, slagg lines', () => {
    expect(ids(make().shop, 'osgar')).toEqual(['healing-flask', 'hearth-bread', 'barley-cake', 'crossbow-bolts', 'iron-ore', 'coal', 'stonefold-greataxe', 'fur-lined-mail', 'greywatch-crossbow', 'fen-leathers']);
    expect(ids(make().shop, 'maud')).toEqual(['maud-stew', 'maud-poultice', 'hearth-bread', 'barley-cake']);
    expect(ids(make().shop, 'pike')).toEqual(['lamp-oil', 'cooling-draught', 'healing-flask']);
    expect(ids(make().shop, 'slagg')).toEqual(['pickaxe', 'ember-coal', 'iron-ore', 'coal', 'cinder-steel-ingot']);
    expect(VENDORS.slagg.buys).toBe(true);
    expect(VENDORS.wenna.lines).toEqual([]);
  });

  it('aldous stock follows the grisel band, with limited sash and pick', () => {
    const by = (b: FavourBand) => ids(make({ band: b }).shop, 'aldous');
    expect(by('cold')).toEqual(['healing-flask', 'barley-cake']);
    expect(by('banked')).toEqual(['healing-flask', 'barley-cake', 'iron-ore', 'coal', 'lamp-oil', 'cooling-draught']);
    expect(by('stoked')).toContain('grisel-oath-sash');
    expect(by('stoked')).not.toContain('deepcore-pick');
    expect(by('hearthbound')).toContain('deepcore-pick');
    const { shop } = make({ band: 'hearthbound' });
    expect(shop.offers('aldous').find((o) => o.itemId === 'deepcore-pick')).toMatchObject({ remaining: 1, price: 320 });
    expect(shop.buy('aldous', 'deepcore-pick').ok).toBe(true);
    expect(shop.buy('aldous', 'deepcore-pick')).toEqual({ ok: false, reason: 'out-of-stock' });
  });

  it('every line has a price and every limited aldous line restores from a save', () => {
    for (const id of ['aldous', 'slagg', 'pike', 'ketta', 'maud', 'osgar'] as const) {
      for (const l of VENDORS[id].lines) expect(SHOP_LIST_PRICES[l.itemId] ?? listPrice(l.itemId), `${id}:${l.itemId}`).toBeGreaterThan(0);
    }
    const a = make({ band: 'hearthbound' });
    a.shop.buy('aldous', 'grisel-oath-sash');
    const saved = JSON.parse(JSON.stringify(a.shop.serialize()));
    const b = make({ band: 'hearthbound' });
    b.shop.load(saved, 1);
    expect(b.shop.offers('aldous').find((o) => o.itemId === 'grisel-oath-sash')!.remaining).toBe(0);
    expect(b.shop.offers('aldous').find((o) => o.itemId === 'deepcore-pick')!.remaining).toBe(1);
    expect(b.w.warnings).toEqual([]);
  });

  it('a v1 vendors save from before Act 2 loads with Act 2 limited lines at default', () => {
    const { shop, w } = make({ band: 'hearthbound' });
    shop.load({ stock: { wystan: { 'marshals-longsword': 0 } }, buyBack: { wystan: [] } }, 1);
    expect(shop.offers('aldous').find((o) => o.itemId === 'deepcore-pick')!.remaining).toBe(1);
    expect(w.warnings).toEqual([]);
  });
});

describe('discounts with bands', () => {
  const price = (band: FavourBand, flags: Record<string, unknown>, id = 'cooling-draught') => make({ band, flags }).shop.quote('aldous', id);
  it('aldous at each band with r09 miners: best single times the band', () => {
    const f = { 'story.r09.choice': 'miners' };
    expect(price('banked', {})).toBe(35);
    expect(price('cold', f)).toBe(Math.round(35 * 1.2 * 0.85));
    expect(price('banked', f)).toBe(Math.round(35 * 0.85));
    expect(price('stoked', f)).toBe(Math.round(35 * 0.9 * 0.85));
    expect(price('hearthbound', f)).toBe(Math.round(35 * 0.8 * 0.85));
  });
  it('r09 and r10 do not add: best wins; stewards 0; compromise 10', () => {
    const q = (flags: Record<string, unknown>) => make({ flags }).shop.quote('slagg', 'pickaxe');
    expect(q({ 'story.r10.choice': 'compromise' })).toBe(54);
    expect(q({ 'story.r10.choice': 'miners' })).toBe(51);
    expect(q({ 'story.r10.choice': 'stewards' })).toBe(60);
    expect(q({ 'story.r09.choice': 'miners', 'story.r10.choice': 'compromise' })).toBe(51);
    expect(q({ 'story.r09.choice': 'other' })).toBe(60);
    expect(make({ flags: { 'story.r09.choice': 'miners' } }).shop.quote('osgar', 'iron-ore')).toBe(12);
  });
  it('never touches the sell price', () => {
    const { shop, w } = make({ flags: { 'story.r09.choice': 'miners' } });
    w.items.set('iron-ore', 1);
    expect(shop.sell('slagg', 'iron-ore')).toEqual({ ok: true, total: 8 });
  });
});

describe('SELL_FLAT and the sell guard', () => {
  it('sells quest-kind ore and ingots at flat prices; other quest items still refuse', () => {
    const { shop, w } = make();
    w.items.set('iron-ore', 3);
    w.items.set('cinder-steel-ingot', 1);
    w.items.set('pickaxe', 1);
    expect(shop.sell('slagg', 'iron-ore', 3)).toEqual({ ok: true, total: 24 });
    w.items.set('coal', 2);
    expect(shop.sell('slagg', 'coal', 2)).toEqual({ ok: true, total: 10 });
    expect(shop.sell('slagg', 'cinder-steel-ingot')).toEqual({ ok: true, total: 40 });
    expect(shop.sell('slagg', 'pickaxe')).toEqual({ ok: false, reason: 'cannot-sell' });
    expect(shop.buyBackFor('slagg')).toHaveLength(3);
  });
  it('refuses a tempered or affixed piece and takes nothing', () => {
    const { shop, w } = make({ gear: { 'oswin-lockpicks': { temper: 2 }, 'barley-cake': { temper: 0, affix: 'ember' } } });
    w.items.set('oswin-lockpicks', 1);
    w.items.set('barley-cake', 1);
    expect(shop.sell('gerta', 'oswin-lockpicks')).toEqual({ ok: false, reason: 'tempered' });
    expect(shop.sell('gerta', 'barley-cake')).toEqual({ ok: false, reason: 'tempered' });
    expect(w.items.get('oswin-lockpicks')).toBe(1);
    expect(w.gold).toBe(5000);
  });
});

describe('arbitrage', () => {
  it('no item sells for more than any vendor charges, with and without discounts', () => {
    const bands: (FavourBand | null)[] = ['cold', 'banked', 'stoked', 'hearthbound'];
    const flagSets: Record<string, unknown>[] = [{}, { 'story.r09.choice': 'miners', 'story.gate.a2': true }, { 'story.r10.choice': 'miners', 'story.gate.a2': true }];
    const items = new Set<string>();
    for (const v of VENDOR_IDS) for (const l of VENDORS[v].lines) items.add(l.itemId);
    const sellOf = (id: string) => SELL_FLAT[id] ?? sellPrice(id) ?? (SHOP_LIST_PRICES[id] !== undefined ? Math.max(1, Math.floor(SHOP_LIST_PRICES[id] * 0.4)) : 0);
    for (const id of items) {
      const sold = sellOf(id);
      for (const v of VENDOR_IDS) {
        if (!VENDORS[v].lines.some((l) => l.itemId === id)) continue;
        for (const b of bands) for (const flags of flagSets) {
          if (!VENDORS[v].track && b !== 'banked') continue;
          const p = make({ band: b ?? 'banked', flags }).shop.quote(v, id);
          if (p === undefined) continue;
          expect(sold, `${id} sold ${sold} vs ${v} ${b} ${JSON.stringify(flags)} charges ${p}`).toBeLessThanOrEqual(p);
        }
      }
    }
    expect(bandAtLeast('banked', 'cold')).toBe(true);
    expect(VENDOR_DISCOUNTS.length).toBeGreaterThan(0);
  });
});
