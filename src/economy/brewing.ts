import { FEN_SALVE } from './items.act3';

/** The inventory and gold reads and writes brewing needs; the plugin binds them to the real inventory. */
export interface BrewPorts {
  count(itemId: string): number;
  stackMax(itemId: string): number;
  gold(): number;
  takeGold(n: number): number;
  remove(itemId: string, n: number): boolean;
  grant(itemId: string, n: number): void;
}

export type BrewResult = { ok: true } | { ok: false; reason: 'no-recipe' | 'no-herbs' | 'no-gold' | 'no-room' };

/** Gytha's Fen Salve: the recipe, one of each herb and 15 gold make one salve. Every refusal takes nothing. */
export function brewFenSalve(p: BrewPorts): BrewResult {
  if (p.count(FEN_SALVE.recipe) < 1) return { ok: false, reason: 'no-recipe' };
  if (FEN_SALVE.herbs.some((h) => p.count(h) < 1)) return { ok: false, reason: 'no-herbs' };
  if (p.gold() < FEN_SALVE.goldCost) return { ok: false, reason: 'no-gold' };
  if (p.count(FEN_SALVE.item) >= p.stackMax(FEN_SALVE.item)) return { ok: false, reason: 'no-room' };
  for (const h of FEN_SALVE.herbs) if (!p.remove(h, 1)) return { ok: false, reason: 'no-herbs' };
  p.takeGold(FEN_SALVE.goldCost);
  p.grant(FEN_SALVE.item, 1);
  return { ok: true };
}
