// Oswin's crates at the siege (plans/act5-N4.md section 6). The numbers are N7's (`siegeSupply(band, r26)` in
// src/items/act5/supply.ts on N7's branch, plans/act5-N7.md): ported here until N7 merges, then this file re-exports it.
import type { FavourBand } from '../state/favour';

export const SIEGE_FLASK_ID = 'oswin-flask';
/** Until N7's item lands (inventory.add of an unknown id adds 0), the crates give the shipped flask. */
export const SIEGE_FLASK_FALLBACK_ID = 'healing-flask';

const BASE: Record<FavourBand, { perBreak: number; resupplies: number }> = {
  cold: { perBreak: 0, resupplies: 0 },
  banked: { perBreak: 3, resupplies: 0 },
  stoked: { perBreak: 6, resupplies: 0 },
  hearthbound: { perBreak: 6, resupplies: 1 },
};

/** Flasks a break and extra resupplies by Oswin's band; the long road delivers two thirds, rounded down. */
export function siegeSupply(band: FavourBand, r26: 'fast' | 'long'): { perBreak: number; resupplies: number } {
  const b = BASE[band];
  return r26 === 'long' ? { perBreak: Math.floor((b.perBreak * 2) / 3), resupplies: b.resupplies } : { ...b };
}
