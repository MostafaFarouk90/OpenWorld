import type { DocumentLike, ElementLike } from '../hud/dom';
import type { InventoryService } from '../hud/ports';
import { inventoryViewModel } from './inventoryViewModel';

export interface InventoryMenuDeps {
  inventory: InventoryService;
  t(key: string, params?: Record<string, string | number>): string;
  close(): void;
}

/** The inventory modal: equipment slots on top, one row per stack with Equip/Unequip/Use buttons. */
export class InventoryMenu {
  readonly element: ElementLike;

  constructor(
    private readonly doc: DocumentLike,
    private readonly deps: InventoryMenuDeps,
  ) {
    this.element = doc.createElement('div');
    this.element.className = 'owg-menu owg-inventory';
    this.render();
  }

  private el(tag: string, className: string, text?: string): ElementLike {
    const e = this.doc.createElement(tag);
    e.className = className;
    if (text !== undefined) e.textContent = text;
    return e;
  }

  private button(label: string, onclick: () => void): ElementLike {
    const b = this.el('button', 'owg-btn', label);
    b.onclick = () => {
      onclick();
      this.render();
    };
    return b;
  }

  render(): void {
    const { inventory: inv, t } = this.deps;
    const vm = inventoryViewModel(inv);
    const head = this.el('div', 'owg-menu-head');
    head.append(this.el('h2', 'owg-menu-title', t('hud.inventory.title')), this.el('span', 'owg-gold', t('hud.inventory.gold', { gold: vm.gold })));
    const close = this.el('button', 'owg-btn', t('hud.inventory.close'));
    close.onclick = () => this.deps.close();
    head.append(close);

    const slots = this.el('div', 'owg-equip-slots');
    for (const s of vm.slots) {
      const row = this.el('div', 'owg-equip-slot');
      row.append(
        this.el('span', 'owg-slot-name', t(`hud.inventory.slot.${s.slot}`)),
        this.el('span', 'owg-slot-item', s.nameKey ? t(s.nameKey) : t('hud.inventory.slotEmpty')),
      );
      if (s.itemId) row.append(this.button(t('hud.inventory.unequip'), () => inv.unequip(s.slot)));
      slots.append(row);
    }

    const list = this.el('div', 'owg-item-list');
    if (vm.rows.length === 0) list.append(this.el('div', 'owg-empty', t('hud.inventory.empty')));
    for (const r of vm.rows) {
      const row = this.el('div', 'owg-item');
      const name = t(r.nameKey) + (r.count > 1 ? ` x${r.count}` : '') + (r.equipped ? ` ${t('hud.inventory.equipped')}` : '');
      row.append(this.el('span', 'owg-item-name', name), this.el('span', 'owg-item-desc', t(r.descKey, { attack: r.stats.attack ?? 0, defense: r.stats.defense ?? 0 })));
      if (r.canEquip && !r.equipped) row.append(this.button(t('hud.inventory.equip'), () => inv.equip(r.id)));
      if (r.canUse) row.append(this.button(t('hud.inventory.use'), () => inv.use(r.id)));
      list.append(row);
    }
    this.element.replaceChildren(head, slots, list);
  }
}
