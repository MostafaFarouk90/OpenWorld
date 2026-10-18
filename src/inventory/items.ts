import type { InventoryKit, ItemDef } from '../hud/ports';

function def(
  id: string,
  kind: ItemDef['kind'],
  rest: Partial<Pick<ItemDef, 'slot' | 'stackMax' | 'stats' | 'use'>> = {},
): ItemDef {
  return { id, nameKey: `item.${id}.name`, descKey: `item.${id}.desc`, kind, stackMax: 1, ...rest };
}

export const ITEMS: Record<string, ItemDef> = {
  'practice-sword': def('practice-sword', 'weapon', { slot: 'weapon', stats: { attack: 8 } }),
  'wooden-round-shield': def('wooden-round-shield', 'offhand', { slot: 'offhand', stats: { defense: 2 } }),
  'squires-arming-sword': def('squires-arming-sword', 'weapon', { slot: 'weapon', stats: { attack: 12 } }),
  'gauts-spare-tabard': def('gauts-spare-tabard', 'armour', { slot: 'armour', stats: { defense: 2 } }),
  'gauts-spare-blade': def('gauts-spare-blade', 'weapon', { slot: 'weapon', stats: { attack: 14 } }),
  'hearth-stone-charm': def('hearth-stone-charm', 'trinket', { slot: 'trinket', stats: { defense: 1 } }),
  'brannoc-hearth-stone': def('brannoc-hearth-stone', 'quest'),
  'hearth-bread': def('hearth-bread', 'consumable', { stackMax: 5, use: { healFlat: 15, drinkSeconds: 0.8 } }),
  'healing-flask': def('healing-flask', 'consumable', { stackMax: 5, use: { healFraction: 0.4, drinkSeconds: 1.2 } }),
};

export function getItem(id: string): ItemDef | undefined {
  return Object.prototype.hasOwnProperty.call(ITEMS, id) ? ITEMS[id] : undefined;
}

export const NEW_GAME_KIT: InventoryKit = {
  items: { 'practice-sword': 1, 'wooden-round-shield': 1 },
  equipped: { weapon: 'practice-sword', offhand: 'wooden-round-shield' },
};

/** "Skip to Kettlewick". */
export const STARTER_KIT: InventoryKit = {
  items: { 'squires-arming-sword': 1, 'gauts-spare-tabard': 1, 'wooden-round-shield': 1, 'healing-flask': 3 },
  equipped: { weapon: 'squires-arming-sword', armour: 'gauts-spare-tabard', offhand: 'wooden-round-shield' },
};
