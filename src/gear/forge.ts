import { getItem } from '../inventory/items';
import { type GearInventory, MATERIALS, type MaterialCost } from './tempering';
import { TIER4_MATERIALS, TIER4_RECIPES, tier4MaterialFor } from './tier4/catalog';
import { GEAR_TUNING } from './tuning';

/** Tier 2 piece to its tier 3 piece (R3). */
export const FORGE_RECIPES: Readonly<Record<string, string>> = {
  'halvard-steel-blade': 'ashforged-longsword',
  'rectangle-shield': 'spike-shield',
  brigandine: 'ashplate',
  'stonefold-greataxe': 'ashforged-cleaver',
  'fur-lined-mail': 'ashplate-harness',
  'archive-wand-of-oswin': 'ashforged-staff',
  'scholars-robe': 'emberthread-robe',
  'guild-twin-daggers': 'ashforged-fangs',
  'couriers-coat': 'soot-leathers',
  'greywatch-crossbow': 'ashforged-arbalest',
  'fen-leathers': 'cinder-hood-and-coat',
};

/** K10: every recipe, tier 2 to 3 and tier 3 to 4 (`TIER4_RECIPES`). */
export const ALL_FORGE_RECIPES: Readonly<Record<string, string>> = { ...FORGE_RECIPES, ...TIER4_RECIPES };
export const isTier4Recipe = (fromId: string): boolean => Object.prototype.hasOwnProperty.call(TIER4_RECIPES, fromId);

/** `no-materials` (K10): a tier 4 forge without its rime-iron, scales or hide; `gems` would leave no room for a gem. */
export type ForgeRefusal = 'no-recipe' | 'not-held' | 'no-ingot' | 'no-gold' | 'locked' | 'owned' | 'no-materials' | 'gems';
export type ForgeResult = { ok: true; from: string; to: string } | { ok: false; reason: ForgeRefusal };

export interface ForgeCost {
  ingots: number;
  gold: number;
  /** Tier 4 only: rime-iron plus shed scales or sloughed hide. */
  materials?: MaterialCost[];
}

export function forgeCost(fromId: string): ForgeCost | null {
  if (isTier4Recipe(fromId)) {
    const f = GEAR_TUNING.forgeTier4;
    const to = TIER4_RECIPES[fromId];
    return {
      ingots: 0,
      gold: getItem(fromId)?.slot === 'weapon' ? f.goldWeapon : f.goldArmour,
      materials: [{ itemId: TIER4_MATERIALS.rimeIron, count: f.rimeIron }, { itemId: tier4MaterialFor(to), count: f.scales }],
    };
  }
  if (!Object.prototype.hasOwnProperty.call(FORGE_RECIPES, fromId)) return null;
  const f = GEAR_TUNING.forge;
  return { ingots: f.ingots, gold: getItem(fromId)?.slot === 'armour' ? f.goldArmour : f.goldWeapon };
}

/**
 * Consumes the tier 2 (or, K10, tier 3) piece (its temper and affix go with it, no refund; gems return to the bag) for the next tier's piece at +0. If the old one was
 * equipped the new one is. Everything is checked before anything is taken.
 */
export function forgeItem(inv: GearInventory, fromId: string): ForgeResult {
  const cost = forgeCost(fromId);
  if (!cost) return { ok: false, reason: 'no-recipe' };
  const to = ALL_FORGE_RECIPES[fromId];
  if (!inv.has(fromId)) return { ok: false, reason: 'not-held' };
  if (inv.has(to)) return { ok: false, reason: 'owned' };
  if (inv.count(MATERIALS.ingot) < cost.ingots) return { ok: false, reason: 'no-ingot' };
  if (cost.materials?.some((m) => inv.count(m.itemId) < m.count)) return { ok: false, reason: 'no-materials' };
  if (inv.gold < cost.gold) return { ok: false, reason: 'no-gold' };
  if (inv.gemRoomFor && !inv.gemRoomFor(fromId)) return { ok: false, reason: 'gems' };
  const slot = getItem(fromId)!.slot!;
  const wasEquipped = inv.equipped(slot) === fromId;
  inv.takeGold(cost.gold, 'script');
  if (cost.ingots > 0) inv.remove(MATERIALS.ingot, cost.ingots);
  for (const m of cost.materials ?? []) inv.remove(m.itemId, m.count);
  inv.remove(fromId, 1); // drops the temper record and unequips
  inv.add(to, 1);
  if (wasEquipped) inv.equip(to);
  return { ok: true, from: fromId, to };
}
