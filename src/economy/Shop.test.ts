import { describe, expect, it } from 'vitest';
import type { ItemDef } from '../hud/ports';
import { ECONOMY_ITEMS } from './items';
import { LIST_PRICES, sellPrice } from './prices';
import { BUY_BACK_MAX, Shop, type ShopPorts } from './Shop';
import type { FavourBand } from '../state/favour';
import type { VendorId } from './stock';

const def = (id: string, kind: ItemDef['kind'], stackMax = 1, slot?: ItemDef['slot']): ItemDef => ({
  id,
  nameKey: id,
  descKey: id,
  kind,
  stackMax,
  slot,
});
const DEFS: Record<string, ItemDef> = {
  'healing-flask': def('healing-flask', 'consumable', 5),
  'hearth-bread': def('hearth-bread', 'consumable', 5),
  'barley-cake': def('barley-cake', 'consumable', 10),
  'oswin-lockpicks': def('oswin-lockpicks', 'consumable', 10),
  'ember-coal': def('ember-coal', 'consumable', 10),
  'crossbow-bolts': def('crossbow-bolts', 'consumable', 40),
  'hearth-stone': def('hearth-stone', 'quest'),
  'squires-arming-sword': def('squires-arming-sword', 'weapon', 1, 'weapon'),
  'gauts-spare-blade': def('gauts-spare-blade', 'weapon', 1, 'weapon'),
  ...Object.fromEntries(ECONOMY_ITEMS.map((d) => [d.id, d])),
};

function world(over: Partial<{ gold: number; bands: Partial<Record<VendorId, FavourBand>>; open: boolean }> = {}) {
  const w = {
    gold: over.gold ?? 1000,
    items: new Map<string, number>(),
    equipped: new Set<string>(),
    bands: { wystan: 'banked', merrin: 'banked', ...over.bands } as Partial<Record<VendorId, FavourBand>>,
    open: over.open ?? true,
    events: [] as [string, unknown][],
    grants: [] as unknown[],
    spent: [] as number[],
    warnings: [] as string[],
  };
  const ports: ShopPorts = {
    gold: () => w.gold,
    takeGold: (n) => {
      const taken = Math.min(n, w.gold);
      w.gold -= taken;
      w.spent.push(taken);
      return taken;
    },
    addGold: (n) => void (w.gold += n),
    count: (id) => w.items.get(id) ?? 0,
    remove: (id, n) => {
      const have = w.items.get(id) ?? 0;
      if (have < n) return false;
      w.items.set(id, have - n);
      return true;
    },
    isEquipped: (id) => w.equipped.has(id),
    getItem: (id) => DEFS[id],
    grant: (src, id, count) => {
      w.grants.push({ src, id, count });
      w.items.set(id, Math.min(DEFS[id].stackMax, (w.items.get(id) ?? 0) + count));
    },
    band: (v) => w.bands[v] ?? null,
    isOpen: () => w.open,
    emit: (t, p) => void w.events.push([t, p]),
    warn: (m) => void w.warnings.push(m),
  };
  return { w, shop: new Shop(ports) };
}

describe('Shop buying', () => {
  it('sells at the band price, takes gold once and grants through loot', () => {
    const { w, shop } = world();
    expect(shop.buy('wystan', 'healing-flask')).toEqual({ ok: true, total: 30 });
    expect(w.gold).toBe(970);
    expect(w.grants).toEqual([{ src: 'vendor:wystan', id: 'healing-flask', count: 1 }]);
    expect(w.events).toEqual([['vendor.bought', { vendorId: 'wystan', itemId: 'healing-flask', count: 1, price: 30 }]]);
  });

  it('refuses one gold short with no gold taken and no event', () => {
    const { w, shop } = world({ gold: 29 });
    expect(shop.buy('wystan', 'healing-flask')).toEqual({ ok: false, reason: 'no-gold' });
    expect(w.gold).toBe(29);
    expect(w.spent).toEqual([]);
    expect(w.events).toEqual([]);
  });

  it('refuses gear the player already owns before any gold moves', () => {
    const { w, shop } = world();
    w.items.set('marshals-longsword', 1);
    expect(shop.buy('wystan', 'marshals-longsword')).toEqual({ ok: false, reason: 'no-room' });
    expect(w.gold).toBe(1000);
    expect(w.spent).toEqual([]);
  });

  it('refuses a stack that would overflow', () => {
    const { w, shop } = world();
    w.items.set('healing-flask', 5);
    expect(shop.buy('wystan', 'healing-flask')).toEqual({ ok: false, reason: 'no-room' });
    expect(shop.buy('wystan', 'healing-flask', 2)).toEqual({ ok: false, reason: 'no-room' });
  });

  it('reports out-of-stock for a limited line at zero', () => {
    const { w, shop } = world();
    shop.buy('wystan', 'marshals-longsword');
    w.items.set('marshals-longsword', 0);
    expect(shop.buy('wystan', 'marshals-longsword')).toEqual({ ok: false, reason: 'out-of-stock' });
  });

  it('refuses unknown vendors, bad counts, closed vendors and unstocked items', () => {
    const { shop, w } = world();
    expect(shop.buy('nobody' as VendorId, 'healing-flask')).toEqual({ ok: false, reason: 'unknown-vendor' });
    expect(shop.buy('wystan', 'healing-flask', 0)).toEqual({ ok: false, reason: 'bad-count' });
    expect(shop.buy('wystan', 'healing-flask', 1.5)).toEqual({ ok: false, reason: 'bad-count' });
    expect(shop.buy('wystan', 'ember-coal')).toEqual({ ok: false, reason: 'not-stocked' });
    w.open = false;
    expect(shop.buy('wystan', 'healing-flask')).toEqual({ ok: false, reason: 'closed' });
    expect(w.gold).toBe(1000);
  });

  it('amounts agree: gold taken equals count times the per-unit price in vendor.bought', () => {
    const { w, shop } = world();
    shop.buy('edda', 'barley-cake', 3);
    const [, payload] = w.events[0] as [string, { count: number; price: number }];
    expect(w.spent[0]).toBe(payload.count * payload.price);
  });

  it('skips lines whose item is not registered, with one warning', () => {
    const { w, shop } = world();
    delete DEFS['crossbow-bolts'];
    try {
      expect(shop.offers('ashdown')).toEqual([]);
      shop.offers('ashdown');
      expect(w.warnings.filter((m) => m.includes('crossbow-bolts'))).toHaveLength(1);
    } finally {
      DEFS['crossbow-bolts'] = def('crossbow-bolts', 'consumable', 40);
    }
  });
});

describe('Shop favour bands', () => {
  const ids = (shop: Shop, v: VendorId) => shop.offers(v).map((o) => o.itemId);

  it.each([
    ['cold', 36, ['healing-flask', 'hearth-bread']],
    ['banked', 30, ['healing-flask', 'hearth-bread', 'marshals-longsword', 'marshals-kite-shield']],
    ['stoked', 27, ['healing-flask', 'hearth-bread', 'marshals-longsword', 'marshals-kite-shield', 'halvard-oath-sash']],
    ['hearthbound', 24, ['healing-flask', 'hearth-bread', 'marshals-longsword', 'marshals-kite-shield', 'halvard-oath-sash', 'marshals-mantle']],
  ] as const)('Wystan at %s: flask %i gold, stock %j', (band, flask, stock) => {
    const { shop } = world({ bands: { wystan: band } });
    expect(shop.offers('wystan').find((o) => o.itemId === 'healing-flask')?.price).toBe(flask);
    expect(ids(shop, 'wystan')).toEqual(stock);
  });

  it('re-reads the band live: stock and price change without reopening', () => {
    const { w, shop } = world({ bands: { merrin: 'cold' } });
    const before = shop.offers('merrin');
    w.bands.merrin = 'stoked';
    const after = shop.offers('merrin');
    expect(after.length).toBeGreaterThan(before.length);
    expect(after.find((o) => o.itemId === 'healing-flask')?.price).toBeLessThan(before.find((o) => o.itemId === 'healing-flask')!.price);
  });

  it('refuses when the price rose since the player saw it, and charges the lower price when it fell', () => {
    const { w, shop } = world({ bands: { wystan: 'stoked' } });
    w.bands.wystan = 'cold';
    expect(shop.buy('wystan', 'healing-flask', 1, 27)).toEqual({ ok: false, reason: 'price-rose' });
    expect(w.gold).toBe(1000);
    expect(w.spent).toEqual([]);
    w.bands.wystan = 'hearthbound';
    expect(shop.buy('wystan', 'healing-flask', 1, 27)).toEqual({ ok: true, total: 24 });
  });

  it('plain shops ignore bands', () => {
    const { shop } = world();
    expect(shop.offers('edda').find((o) => o.itemId === 'hearth-bread')?.price).toBe(10);
  });
});

describe('Shop selling and buy-back', () => {
  it('buys unequipped priced gear at 40% and remembers it', () => {
    const { w, shop } = world({ gold: 0 });
    w.items.set('gauts-spare-blade', 1);
    expect(shop.sell('wystan', 'gauts-spare-blade')).toEqual({ ok: true, total: 28 });
    expect(w.gold).toBe(28);
    expect(w.events[0]).toEqual(['vendor.sold', { vendorId: 'wystan', itemId: 'gauts-spare-blade', count: 1, price: 28 }]);
    expect(shop.buyBackFor('wystan')).toEqual([{ itemId: 'gauts-spare-blade', count: 1, price: 28 }]);
    expect(shop.buyBack('wystan', 0)).toEqual({ ok: true, total: 28 });
    expect(w.gold).toBe(0);
    expect(shop.buyBackFor('wystan')).toEqual([]);
    expect(w.items.get('gauts-spare-blade')).toBe(1);
  });

  it('refuses equipped, quest, unpriced, unowned and vendors that do not buy', () => {
    const { w, shop } = world();
    w.items.set('squires-arming-sword', 1);
    w.equipped.add('squires-arming-sword');
    expect(shop.sell('wystan', 'squires-arming-sword')).toEqual({ ok: false, reason: 'equipped' });
    w.items.set('hearth-stone', 1);
    expect(shop.sell('wystan', 'hearth-stone')).toEqual({ ok: false, reason: 'cannot-sell' });
    w.items.set('ember-coal', 1);
    expect(shop.sell('merrin', 'ember-coal').ok).toBe(true);
    expect(shop.sell('wystan', 'gauts-spare-blade')).toEqual({ ok: false, reason: 'not-owned' });
    expect(shop.sell('edda', 'ember-coal')).toEqual({ ok: false, reason: 'cannot-sell' });
    expect(w.items.get('squires-arming-sword')).toBe(1);
  });

  it('lets a spare copy of an equipped item go', () => {
    const { w, shop } = world();
    w.items.set('squires-arming-sword', 2);
    w.equipped.add('squires-arming-sword');
    expect(shop.sell('wystan', 'squires-arming-sword').ok).toBe(true);
  });

  it('keeps at most twelve buy-back entries and drops the oldest first', () => {
    const { w, shop } = world();
    const priced = Object.keys(LIST_PRICES).filter((id) => DEFS[id] && DEFS[id].kind !== 'quest' && sellPrice(id) !== undefined);
    expect(priced.length).toBeGreaterThan(BUY_BACK_MAX);
    for (const id of priced) w.items.set(id, 1);
    for (const id of priced) shop.sell('wystan', id);
    const list = shop.buyBackFor('wystan');
    expect(list.length).toBe(BUY_BACK_MAX);
    expect(list[list.length - 1].itemId).toBe(priced[priced.length - 1]);
    expect(list.some((e) => e.itemId === priced[0])).toBe(false);
  });

  it('moves a merged sale to the end and never merges past the stack max', () => {
    const { w, shop } = world();
    w.items.set('barley-cake', 10);
    w.items.set('hearth-bread', 2);
    shop.sell('merrin', 'barley-cake', 6);
    shop.sell('merrin', 'hearth-bread');
    shop.sell('merrin', 'barley-cake', 4);
    const list = shop.buyBackFor('merrin');
    expect(list.map((e) => [e.itemId, e.count])).toEqual([['hearth-bread', 1], ['barley-cake', 10]]);
    w.items.set('barley-cake', 1);
    shop.sell('merrin', 'barley-cake', 1); // 11 would exceed the stack of 10: a separate entry
    expect(shop.buyBackFor('merrin').filter((e) => e.itemId === 'barley-cake').map((e) => e.count)).toEqual([10, 1]);
  });

  it('refuses buy-back without gold or room and for a bad index', () => {
    const { w, shop } = world({ gold: 0 });
    w.items.set('gauts-spare-blade', 1);
    shop.sell('wystan', 'gauts-spare-blade');
    w.gold = 27;
    expect(shop.buyBack('wystan', 0)).toEqual({ ok: false, reason: 'no-gold' });
    w.gold = 100;
    w.items.set('gauts-spare-blade', 1);
    expect(shop.buyBack('wystan', 0)).toEqual({ ok: false, reason: 'no-room' });
    expect(shop.buyBack('wystan', 5)).toEqual({ ok: false, reason: 'no-such-entry' });
  });
});

describe('Shop save and load', () => {
  it('round-trips limited stock and buy-back', () => {
    const { w, shop } = world();
    shop.buy('wystan', 'marshals-longsword');
    w.items.set('gauts-spare-blade', 1);
    shop.sell('merrin', 'gauts-spare-blade');
    const saved = JSON.parse(JSON.stringify(shop.serialize()));
    const other = world().shop;
    other.load(saved, 1);
    expect(other.serialize()).toEqual(shop.serialize());
    expect(other.offers('wystan').find((o) => o.itemId === 'marshals-longsword')?.remaining).toBe(0);
  });

  it('drops bad entries with a warning and falls back to default stock', () => {
    const { w, shop } = world();
    shop.load(
      { stock: { wystan: { 'marshals-longsword': -3, 'healing-flask': 4 }, ghost: {} }, buyBack: { wystan: [{ itemId: 'x', count: 0, price: 5 }, 'junk'], merrin: 'no' } },
      1,
    );
    expect(w.warnings.length).toBeGreaterThanOrEqual(4);
    expect(shop.serialize().buyBack.wystan).toEqual([]);
    expect(shop.serialize().stock.wystan['marshals-longsword']).toBe(1);
    shop.load({ stock: { wystan: { 'marshals-longsword': 5 } } }, 1);
    expect(shop.serialize().stock.wystan['marshals-longsword']).toBe(1); // a corrupt save cannot restock unique gear
    shop.load(null, 1);
    shop.load({}, 99);
    expect(shop.serialize().stock.wystan['marshals-longsword']).toBe(1);
  });
});
