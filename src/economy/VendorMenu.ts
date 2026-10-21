import type { DocumentLike, ElementLike } from '../hud/dom';
import type { InventoryService } from '../hud/ports';
import { getItem } from '../inventory/items';
import { sellPrice } from './prices';
import type { BuyBackEntry, Offer, ShopFailure, ShopResult } from './Shop';
import { SELL_FLAT, SHOP_LIST_PRICES, VENDORS, type VendorId } from './stock';

type T = (key: string, params?: Record<string, string | number>) => string;

export interface VendorMenuDeps {
  vendorId: VendorId;
  inventory: Pick<InventoryService, 'items' | 'gold' | 'equipped'>;
  offers(): Offer[];
  buyBackList(): readonly BuyBackEntry[];
  buy(itemId: string, seenPrice: number): ShopResult;
  sell(itemId: string): ShopResult;
  buyBack(index: number): ShopResult;
  /** The player's class id, to dim off-class rows; absent means no dimming. */
  classId?(): string | null;
  t: T;
  toast(text: string): void;
  close(): void;
}

type Tab = 'buy' | 'sell' | 'buyBack';

/** The shop view: it owns no transactions; every action goes through the Shop service and then re-renders. */
export class VendorMenu {
  readonly element: ElementLike;
  private tab: Tab = 'buy';

  constructor(
    private readonly doc: DocumentLike,
    private readonly deps: VendorMenuDeps,
  ) {
    this.element = doc.createElement('div');
    this.element.className = 'owg-menu owg-vendor';
    this.render();
  }

  private el(tag: string, className: string, text?: string): ElementLike {
    const e = this.doc.createElement(tag);
    e.className = className;
    if (text !== undefined) e.textContent = text;
    return e;
  }

  private act(result: ShopResult): void {
    if (!result.ok) {
      const key = `economy.shop.fail.${result.reason as ShopFailure}`;
      const text = this.deps.t(key);
      this.deps.toast(text === key ? this.deps.t('economy.shop.fail.generic') : text);
    }
    this.render();
  }

  render(): void {
    const { t, vendorId } = this.deps;
    const head = this.el('div', 'owg-menu-head');
    head.append(
      this.el('h2', 'owg-menu-title', t(`economy.shop.title.${vendorId}`)),
      this.el('span', 'owg-gold', t('economy.shop.gold', { gold: this.deps.inventory.gold })),
    );
    const close = this.el('button', 'owg-btn', t('economy.shop.close'));
    close.onclick = () => this.deps.close();
    head.append(close);

    const tabs = this.el('div', 'owg-vendor-tabs');
    const names: Tab[] = VENDORS[vendorId].buys ? ['buy', 'sell', 'buyBack'] : ['buy'];
    for (const name of names) {
      const b = this.el('button', 'owg-btn' + (name === this.tab ? ' owg-active' : ''), t(`economy.shop.tab.${name}`));
      b.onclick = () => {
        this.tab = name;
        this.render();
      };
      tabs.append(b);
    }

    const list = this.el('div', 'owg-item-list');
    const row = (name: string, note: string, label: string, onclick: () => void, dim = false): void => {
      const r = this.el('div', 'owg-item' + (dim ? ' owg-dim' : ''));
      r.append(this.el('span', 'owg-item-name', name), this.el('span', 'owg-item-desc', note));
      const b = this.el('button', 'owg-btn', label);
      b.onclick = onclick;
      r.append(b);
      list.append(r);
    };
    const nameOf = (id: string): string => {
      const def = getItem(id);
      const key = def?.nameKey ?? `item.${id}.name`;
      const text = t(key);
      return text === key ? id : text;
    };
    if (this.tab === 'buy') {
      for (const o of this.deps.offers()) {
        const cls = this.deps.classId?.();
        const off = !!o.classes && !!cls && !o.classes.includes(cls);
        const left = o.remaining === null ? '' : t('economy.shop.left', { n: o.remaining });
        const note = off ? [left, t('economy.shop.otherClass')].filter(Boolean).join(' · ') : left;
        row(nameOf(o.itemId), note, t('economy.shop.buy', { price: o.price }), () => this.act(this.deps.buy(o.itemId, o.price)), off);
      }
    } else if (this.tab === 'sell') {
      for (const { id, count } of this.deps.inventory.items()) {
        const def = getItem(id);
        if (!def || (def.kind === 'quest' && SELL_FLAT[id] === undefined)) continue;
        const price = SELL_FLAT[id] ?? sellPrice(id) ?? (SHOP_LIST_PRICES[id] !== undefined ? Math.max(1, Math.floor(SHOP_LIST_PRICES[id] * 0.4)) : undefined);
        if (price === undefined) continue;
        row(`${nameOf(id)}${count > 1 ? ` x${count}` : ''}`, '', t('economy.shop.sell', { price }), () => this.act(this.deps.sell(id)));
      }
    } else {
      this.deps.buyBackList().forEach((e, i) => {
        row(`${nameOf(e.itemId)}${e.count > 1 ? ` x${e.count}` : ''}`, '', t('economy.shop.buyBackBtn', { price: e.price * e.count }), () =>
          this.act(this.deps.buyBack(i)),
        );
      });
    }
    if (list.children.length === 0) list.append(this.el('div', 'owg-empty', t('economy.shop.empty')));
    this.element.replaceChildren(head, tabs, list);
  }
}
