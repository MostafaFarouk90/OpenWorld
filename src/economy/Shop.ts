import type { ItemDef } from '../hud/ports';
import type { FavourBand } from '../state/favour';
import { bandPrice, listPrice, sellPrice } from './prices';
import { bandAtLeast, discountPercent, isVendorId, SHOP_LIST_PRICES, VENDORS, type StockLine, type VendorDiscount, type VendorId } from './stock';

export const BUY_BACK_MAX = 12;

export interface BuyBackEntry {
  itemId: string;
  count: number;
  /** Per unit, the price the vendor paid. */
  price: number;
}

export interface VendorsSave {
  stock: Record<string, Record<string, number>>;
  buyBack: Record<string, BuyBackEntry[]>;
}

export interface ShopPorts {
  gold(): number;
  takeGold(n: number, reason: 'vendor'): number;
  addGold(n: number): void;
  count(itemId: string): number;
  remove(itemId: string, n: number): boolean;
  isEquipped(itemId: string): boolean;
  getItem(itemId: string): ItemDef | undefined;
  /** Items enter only through `loot.granted`. */
  grant(sourceId: string, itemId: string, count: number): void;
  /** The favour band of a vendor's track, read live. */
  band(vendorId: VendorId): FavourBand | null;
  /** Whether the vendor's gate is open (story flags, Gerta's post rule). */
  isOpen(vendorId: VendorId): boolean;
  emit(type: 'vendor.bought' | 'vendor.sold', payload: { vendorId: string; itemId: string; count: number; price: number }): void;
  warn(message: string): void;
  /** Reads a story flag for `VENDOR_DISCOUNTS`; absent means no discounts apply. */
  flag?(key: string): unknown;
  /** Test seam: the discount table (default `VENDOR_DISCOUNTS`). */
  discounts?: readonly VendorDiscount[];
}

export type ShopFailure =
  | 'unknown-vendor'
  | 'closed'
  | 'not-stocked'
  | 'out-of-stock'
  | 'unknown-item'
  | 'no-room'
  | 'no-gold'
  | 'bad-count'
  | 'cannot-sell'
  | 'equipped'
  | 'not-owned'
  | 'no-such-entry'
  | 'price-rose';

export type ShopResult = { ok: true; total: number } | { ok: false; reason: ShopFailure };

export interface Offer {
  itemId: string;
  /** Per-unit price now. */
  price: number;
  /** Units left, or null when unlimited. */
  remaining: number | null;
}

const isCount = (n: unknown): n is number => typeof n === 'number' && Number.isInteger(n) && n > 0;

/** Vendors' stock and buy-back. Every transaction validates fully, then takes gold, with no refund path. */
export class Shop {
  static readonly key = 'vendors';
  static readonly version = 1;
  private readonly stock = new Map<VendorId, Map<string, number>>();
  private readonly buyBackList = new Map<VendorId, BuyBackEntry[]>();
  private readonly warned = new Set<string>();

  constructor(private readonly ports: ShopPorts) {
    this.reset();
  }

  reset(): void {
    this.stock.clear();
    this.buyBackList.clear();
    for (const [id, def] of Object.entries(VENDORS)) {
      const m = new Map<string, number>();
      for (const l of def.lines) if (l.count !== undefined) m.set(l.itemId, l.count);
      this.stock.set(id as VendorId, m);
      this.buyBackList.set(id as VendorId, []);
    }
  }

  private warnOnce(msg: string): void {
    if (this.warned.has(msg)) return;
    this.warned.add(msg);
    this.ports.warn(msg);
  }

  private unitList(itemId: string): number | undefined {
    return SHOP_LIST_PRICES[itemId] ?? listPrice(itemId);
  }

  private line(vendorId: VendorId, itemId: string): StockLine | undefined {
    return VENDORS[vendorId].lines.find((l) => l.itemId === itemId);
  }

  private remainingOf(vendorId: VendorId, l: StockLine): number | null {
    return l.count === undefined ? null : (this.stock.get(vendorId)?.get(l.itemId) ?? 0);
  }

  /** The unit price of a stocked line at the vendor's current band. */
  quote(vendorId: VendorId, itemId: string): number | undefined {
    const list = this.unitList(itemId);
    if (list === undefined) return undefined;
    const off = this.ports.flag ? discountPercent(vendorId, this.ports.flag, this.ports.discounts) : 0;
    return bandPrice(list, VENDORS[vendorId].track ? this.ports.band(vendorId) : null, off);
  }

  /** What the vendor sells right now: lines whose band is reached and whose item is registered. */
  offers(vendorId: VendorId): Offer[] {
    if (!isVendorId(vendorId)) return [];
    const def = VENDORS[vendorId];
    const band = def.track ? this.ports.band(vendorId) : null;
    const out: Offer[] = [];
    for (const l of def.lines) {
      if (def.track && band && !bandAtLeast(band, l.from)) continue;
      if (!this.ports.getItem(l.itemId)) {
        this.warnOnce(`economy: ${vendorId} stocks unregistered item "${l.itemId}"; skipped`);
        continue;
      }
      const price = this.quote(vendorId, l.itemId);
      if (price === undefined) {
        this.warnOnce(`economy: no list price for "${l.itemId}"; skipped`);
        continue;
      }
      out.push({ itemId: l.itemId, price, remaining: this.remainingOf(vendorId, l) });
    }
    return out;
  }

  buyBackFor(vendorId: VendorId): readonly BuyBackEntry[] {
    return (this.buyBackList.get(vendorId) ?? []).map((e) => ({ ...e }));
  }

  /** `seenPrice` is the per-unit price the player was shown; a higher price now refuses instead of charging more. */
  buy(vendorId: VendorId, itemId: string, count = 1, seenPrice?: number): ShopResult {
    if (!isVendorId(vendorId)) return { ok: false, reason: 'unknown-vendor' };
    if (!isCount(count)) return { ok: false, reason: 'bad-count' };
    if (!this.ports.isOpen(vendorId)) return { ok: false, reason: 'closed' };
    const offer = this.offers(vendorId).find((o) => o.itemId === itemId);
    if (!offer) return { ok: false, reason: 'not-stocked' };
    const def = this.ports.getItem(itemId);
    if (!def) return { ok: false, reason: 'unknown-item' };
    if (seenPrice !== undefined && offer.price > seenPrice) return { ok: false, reason: 'price-rose' };
    if (offer.remaining !== null && offer.remaining < count) return { ok: false, reason: 'out-of-stock' };
    if (this.ports.count(itemId) + count > def.stackMax) return { ok: false, reason: 'no-room' };
    const total = offer.price * count;
    if (this.ports.gold() < total) return { ok: false, reason: 'no-gold' };
    this.complete(vendorId, itemId, count, offer.price, total, offer.remaining !== null);
    return { ok: true, total };
  }

  private complete(vendorId: VendorId, itemId: string, count: number, unit: number, total: number, limited: boolean): void {
    const taken = this.ports.takeGold(total, 'vendor');
    if (taken !== total) this.ports.warn(`economy: ${vendorId} sale of ${itemId} took ${taken} of ${total} gold`);
    if (limited) {
      const m = this.stock.get(vendorId);
      m?.set(itemId, (m.get(itemId) ?? 0) - count);
    }
    this.ports.grant(`vendor:${vendorId}`, itemId, count);
    this.ports.emit('vendor.bought', { vendorId, itemId, count, price: unit });
  }

  sell(vendorId: VendorId, itemId: string, count = 1): ShopResult {
    if (!isVendorId(vendorId)) return { ok: false, reason: 'unknown-vendor' };
    if (!isCount(count)) return { ok: false, reason: 'bad-count' };
    if (!this.ports.isOpen(vendorId)) return { ok: false, reason: 'closed' };
    if (!VENDORS[vendorId].buys) return { ok: false, reason: 'cannot-sell' };
    const def = this.ports.getItem(itemId);
    if (!def) return { ok: false, reason: 'unknown-item' };
    if (def.kind === 'quest') return { ok: false, reason: 'cannot-sell' };
    const unit = this.sellUnit(itemId);
    if (unit === undefined) return { ok: false, reason: 'cannot-sell' };
    const have = this.ports.count(itemId);
    if (have < count) return { ok: false, reason: 'not-owned' };
    if (have - count < 1 && this.ports.isEquipped(itemId)) return { ok: false, reason: 'equipped' };
    if (!this.ports.remove(itemId, count)) return { ok: false, reason: 'not-owned' };
    const total = unit * count;
    this.ports.addGold(total);
    const list = this.buyBackList.get(vendorId) ?? [];
    const idx = list.findIndex((e) => e.itemId === itemId && e.price === unit && e.count + count <= (def.stackMax || 1));
    if (idx >= 0) {
      // A fresh sale goes to the end so eviction (oldest first) never takes it before older entries.
      const [same] = list.splice(idx, 1);
      list.push({ ...same, count: same.count + count });
    } else list.push({ itemId, count, price: unit });
    while (list.length > BUY_BACK_MAX) list.shift();
    this.buyBackList.set(vendorId, list);
    this.ports.emit('vendor.sold', { vendorId, itemId, count, price: unit });
    return { ok: true, total };
  }

  private sellUnit(itemId: string): number | undefined {
    const unit = sellPrice(itemId);
    if (unit !== undefined) return unit;
    const shop = SHOP_LIST_PRICES[itemId];
    return shop === undefined ? undefined : Math.max(1, Math.floor(shop * 0.4));
  }

  buyBack(vendorId: VendorId, index: number): ShopResult {
    if (!isVendorId(vendorId)) return { ok: false, reason: 'unknown-vendor' };
    if (!this.ports.isOpen(vendorId)) return { ok: false, reason: 'closed' };
    const list = this.buyBackList.get(vendorId) ?? [];
    const e = list[index];
    if (!e) return { ok: false, reason: 'no-such-entry' };
    const def = this.ports.getItem(e.itemId);
    if (!def) return { ok: false, reason: 'unknown-item' };
    if (this.ports.count(e.itemId) + e.count > def.stackMax) return { ok: false, reason: 'no-room' };
    const total = e.price * e.count;
    if (this.ports.gold() < total) return { ok: false, reason: 'no-gold' };
    list.splice(index, 1);
    const taken = this.ports.takeGold(total, 'vendor');
    if (taken !== total) this.ports.warn(`economy: ${vendorId} buy-back of ${e.itemId} took ${taken} of ${total} gold`);
    this.ports.grant(`vendor:${vendorId}`, e.itemId, e.count);
    this.ports.emit('vendor.bought', { vendorId, itemId: e.itemId, count: e.count, price: e.price });
    return { ok: true, total };
  }

  serialize(): VendorsSave {
    const stock: VendorsSave['stock'] = {};
    for (const [v, m] of this.stock) stock[v] = Object.fromEntries(m);
    const buyBack: VendorsSave['buyBack'] = {};
    for (const [v, l] of this.buyBackList) buyBack[v] = l.map((e) => ({ ...e }));
    return { stock, buyBack };
  }

  /** Bad entries are dropped with a warning; anything unreadable falls back to default stock. */
  load(data: unknown, version: number): void {
    this.reset();
    if (version !== Shop.version || typeof data !== 'object' || data === null) return;
    const d = data as Partial<VendorsSave>;
    for (const [v, rec] of Object.entries(d.stock ?? {})) {
      if (!isVendorId(v) || typeof rec !== 'object' || rec === null) {
        this.ports.warn(`economy: dropped bad stock entry "${v}"`);
        continue;
      }
      const m = this.stock.get(v)!;
      for (const [itemId, n] of Object.entries(rec)) {
        const limited = this.line(v, itemId)?.count !== undefined;
        const max = this.line(v, itemId)?.count ?? 0;
        if (limited && typeof n === 'number' && Number.isInteger(n) && n >= 0 && n <= max) m.set(itemId, n);
        else this.ports.warn(`economy: dropped bad stock "${v}.${itemId}"`);
      }
    }
    for (const [v, arr] of Object.entries(d.buyBack ?? {})) {
      if (!isVendorId(v) || !Array.isArray(arr)) {
        this.ports.warn(`economy: dropped bad buy-back list "${v}"`);
        continue;
      }
      const list: BuyBackEntry[] = [];
      for (const e of arr as BuyBackEntry[]) {
        if (e && typeof e.itemId === 'string' && isCount(e.count) && isCount(e.price)) list.push({ itemId: e.itemId, count: e.count, price: e.price });
        else this.ports.warn(`economy: dropped bad buy-back entry in "${v}"`);
      }
      this.buyBackList.set(v, list.slice(-BUY_BACK_MAX));
    }
  }
}
