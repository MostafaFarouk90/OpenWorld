import { EQUIP_SLOTS, type EquipSlot, type InventoryService } from '../hud/ports';
import { getItem } from './items';

export interface InventoryRow {
  id: string;
  nameKey: string;
  descKey: string;
  count: number;
  equipped: boolean;
  canEquip: boolean;
  canUse: boolean;
  stats: { attack?: number; defense?: number };
}

export interface InventoryViewModel {
  gold: number;
  slots: { slot: EquipSlot; itemId: string | null; nameKey: string | null }[];
  rows: InventoryRow[];
}

/** Pure description of the inventory screen; unknown ids (a newer build's items) are skipped. */
export function inventoryViewModel(inv: InventoryService): InventoryViewModel {
  const slots = EQUIP_SLOTS.map((slot) => {
    const itemId = inv.equipped(slot);
    return { slot, itemId, nameKey: itemId ? (getItem(itemId)?.nameKey ?? null) : null };
  });
  const rows: InventoryRow[] = [];
  for (const { id, count } of inv.items()) {
    const def = getItem(id);
    if (!def || count <= 0) continue;
    rows.push({
      id,
      nameKey: def.nameKey,
      descKey: def.descKey,
      count,
      equipped: def.slot !== undefined && inv.equipped(def.slot) === id,
      canEquip: def.slot !== undefined,
      canUse: def.use !== undefined,
      stats: def.stats ?? {},
    });
  }
  return { gold: inv.gold, slots, rows };
}
