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
  'hearth-stone': def('hearth-stone', 'quest'),
  'hearth-token': def('hearth-token', 'quest'),
  'hearth-bread': def('hearth-bread', 'consumable', { stackMax: 5, use: { healFlat: 15, drinkSeconds: 0.8 } }),
  // Brightwater quest rewards (slice 2). Stats are display-only readings: nothing applies gear defense yet.
  'ford-guard-shield': def('ford-guard-shield', 'offhand', { slot: 'offhand', stats: { defense: 3 } }),
  'barley-cake': def('barley-cake', 'consumable', { stackMax: 10, use: { healFlat: 10, drinkSeconds: 0.8 } }),
  'training-weights': def('training-weights', 'trinket', { slot: 'trinket' }),
  'tobbs-lucky-whistle': def('tobbs-lucky-whistle', 'trinket', { slot: 'trinket' }),
  'priors-censer': def('priors-censer', 'trinket', { slot: 'trinket' }),
  // Class starter gear (design 9, tier 1), granted by the M07 trainers (thread 12, src/classes/kits.ts).
  'woodcutters-axe': def('woodcutters-axe', 'weapon', { slot: 'weapon', stats: { attack: 14 } }),
  'hide-jerkin': def('hide-jerkin', 'armour', { slot: 'armour', stats: { defense: 3 } }),
  'apprentices-staff': def('apprentices-staff', 'weapon', { slot: 'weapon', stats: { attack: 8 } }),
  'wool-robe': def('wool-robe', 'armour', { slot: 'armour', stats: { defense: 1 } }),
  'alley-knives': def('alley-knives', 'weapon', { slot: 'weapon', stats: { attack: 11 } }),
  'leather-vest': def('leather-vest', 'armour', { slot: 'armour', stats: { defense: 2 } }),
  'hunting-crossbow': def('hunting-crossbow', 'weapon', { slot: 'weapon', stats: { attack: 10 } }),
  'rangers-cloak': def('rangers-cloak', 'armour', { slot: 'armour', stats: { defense: 2 } }),
  'healing-flask': def('healing-flask', 'consumable', { stackMax: 5, use: { healFraction: 0.4, drinkSeconds: 1.2 } }),
};

/**
 * Adds item definitions from another module (the economy). Call at module scope so ids exist before a save loads
 * (`Inventory.load` stashes unknown ids). A duplicate id throws.
 */
export function registerItems(defs: readonly ItemDef[]): void {
  for (const d of defs) {
    if (Object.prototype.hasOwnProperty.call(ITEMS, d.id)) throw new Error(`registerItems: duplicate item id "${d.id}"`);
    ITEMS[d.id] = d;
  }
}

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
