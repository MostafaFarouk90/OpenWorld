import { getItem } from '../inventory/items';
import { type GearInventory, MATERIALS } from './tempering';
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

export type ForgeRefusal = 'no-recipe' | 'not-held' | 'no-ingot' | 'no-gold' | 'locked' | 'owned';
export type ForgeResult = { ok: true; from: string; to: string } | { ok: false; reason: ForgeRefusal };

export interface ForgeCost {
  ingots: number;
  gold: number;
}

export function forgeCost(fromId: string): ForgeCost | null {
  if (!Object.prototype.hasOwnProperty.call(FORGE_RECIPES, fromId)) return null;
  const f = GEAR_TUNING.forge;
  return { ingots: f.ingots, gold: getItem(fromId)?.slot === 'armour' ? f.goldArmour : f.goldWeapon };
}

/**
 * Consumes the tier 2 piece (its temper and affix go with it, no refund) for the tier 3 piece at +0. If the old one was
 * equipped the new one is. Everything is checked before anything is taken.
 */
export function forgeItem(inv: GearInventory, fromId: string): ForgeResult {
  const cost = forgeCost(fromId);
  if (!cost) return { ok: false, reason: 'no-recipe' };
  const to = FORGE_RECIPES[fromId];
  if (!inv.has(fromId)) return { ok: false, reason: 'not-held' };
  if (inv.has(to)) return { ok: false, reason: 'owned' };
  if (inv.count(MATERIALS.ingot) < cost.ingots) return { ok: false, reason: 'no-ingot' };
  if (inv.gold < cost.gold) return { ok: false, reason: 'no-gold' };
  const slot = getItem(fromId)!.slot!;
  const wasEquipped = inv.equipped(slot) === fromId;
  inv.takeGold(cost.gold, 'script');
  inv.remove(MATERIALS.ingot, cost.ingots);
  inv.remove(fromId, 1); // drops the temper record and unequips
  inv.add(to, 1);
  if (wasEquipped) inv.equip(to);
  return { ok: true, from: fromId, to };
}
