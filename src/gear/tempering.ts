import type { InventoryService, ItemDef } from '../hud/ports';
import { getItem } from '../inventory/items';
import { GEAR_TUNING } from './tuning';

/** The slice of the inventory service tempering and the forge use. */
export type GearInventory = Pick<InventoryService, 'count' | 'has' | 'add' | 'remove' | 'equip' | 'equipped' | 'gear' | 'setTemper' | 'gold' | 'takeGold' | 'items'>;

export interface MaterialCost {
  itemId: string;
  count: number;
}
export interface TemperCost {
  gold: number;
  materials: MaterialCost[];
}

export type TemperRefusal = 'unknown-item' | 'not-temperable' | 'not-held' | 'at-cap' | 'no-gold' | 'no-materials' | 'locked' | 'anvil-first';
export type TemperResult = { ok: true; level: number; affix?: string } | { ok: false; reason: TemperRefusal };

export const MATERIALS = { ore: 'iron-ore', coal: 'coal', ingot: 'cinder-steel-ingot' } as const;

/** Tier of any item: `gearTier`, or 1 for the Act 1 pieces. */
export const tierOf = (def: ItemDef | undefined): number => def?.gearTier ?? 1;

export function isTemperable(def: ItemDef | undefined): def is ItemDef {
  return !!def && (def.kind === 'weapon' || def.kind === 'offhand' || def.kind === 'armour') && !!def.stats && (def.stats.attack !== undefined || def.stats.defense !== undefined);
}

/** Cost to reach `toLevel` (1..5) on a piece of `tier`; null outside the range. */
export function temperCost(tier: number, toLevel: number): TemperCost | null {
  if (!Number.isInteger(toLevel) || toLevel < 1 || toLevel > GEAR_TUNING.maxTemper) return null;
  const t = tier >= 3 ? 3 : tier === 2 ? 2 : 1;
  const materials: MaterialCost[] =
    t === 3 ? [{ itemId: MATERIALS.ingot, count: 1 }] : t === 2 ? [{ itemId: MATERIALS.ore, count: 1 }, { itemId: MATERIALS.coal, count: 1 }] : [];
  return { gold: GEAR_TUNING.goldPerLevel[t] * toLevel, materials };
}

/** Base stat grown by +5% per temper level, rounded. */
export function effectiveStats(itemId: string, temper: number): { attack?: number; defense?: number } {
  const stats = getItem(itemId)?.stats;
  if (!stats) return {};
  const k = 1 + GEAR_TUNING.combat.temperPerLevel * Math.min(GEAR_TUNING.maxTemper, Math.max(0, Math.floor(temper)));
  const out: { attack?: number; defense?: number } = {};
  if (stats.attack !== undefined) out.attack = Math.round(stats.attack * k);
  if (stats.defense !== undefined) out.defense = Math.round(stats.defense * k);
  return out;
}

export interface TemperOptions {
  /** A lesson run: no gold or materials are taken. */
  free?: boolean;
  /** The affix a perfect Anvil run earned. */
  affix?: string;
}

/** Why the next temper of `itemId` cannot happen, or null. Touches nothing. */
export function checkTemper(inv: GearInventory, itemId: string, opts: TemperOptions = {}): TemperRefusal | null {
  const def = getItem(itemId);
  if (!def) return 'unknown-item';
  if (!isTemperable(def)) return 'not-temperable';
  if (!inv.has(itemId)) return 'not-held';
  const level = inv.gear(itemId).temper + 1;
  const cost = temperCost(tierOf(def), level);
  if (!cost) return 'at-cap';
  if (opts.free) return null;
  if (inv.gold < cost.gold) return 'no-gold';
  if (cost.materials.some((m) => inv.count(m.itemId) < m.count)) return 'no-materials';
  return null;
}

/** Validates, then takes gold and materials, then sets the temper. A refusal takes nothing. The caller emits `gear.tempered`. */
export function temperItem(inv: GearInventory, itemId: string, opts: TemperOptions = {}): TemperResult {
  const why = checkTemper(inv, itemId, opts);
  if (why) return { ok: false, reason: why };
  const level = inv.gear(itemId).temper + 1;
  const cost = temperCost(tierOf(getItem(itemId)), level)!;
  if (!opts.free) {
    if (cost.gold > 0) inv.takeGold(cost.gold, 'script');
    for (const m of cost.materials) inv.remove(m.itemId, m.count);
  }
  inv.setTemper(itemId, level, opts.affix);
  return opts.affix ? { ok: true, level, affix: opts.affix } : { ok: true, level };
}

/** Has any piece of this tier been tempered at the Anvil yet? (`anvilTiers` is the persisted list.) */
export const firstTemperOfTier = (anvilTiers: readonly number[], tier: number): boolean => !anvilTiers.includes(tier);
