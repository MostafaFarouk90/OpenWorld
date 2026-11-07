// Act 5 N7 (plans/act5-N7.md section 7): the flasks Oswin's supply puts in the M52 crates. N4 imports `siegeSupply`.
import type { FavourBand } from '../../state/favour';

export type R26Choice = 'fast' | 'long';

export const SUPPLY_BASE: Readonly<Record<FavourBand, { perBreak: number; resupplies: number }>> = {
  cold: { perBreak: 0, resupplies: 0 },
  banked: { perBreak: 3, resupplies: 0 },
  stoked: { perBreak: 6, resupplies: 0 },
  hearthbound: { perBreak: 6, resupplies: 1 },
};

/** Flasks per wave break, and extra resupplies per break. `fast` delivers it all, `long` two thirds (rounded down); anything else is `long`. */
export function siegeSupply(band: FavourBand, r26: unknown): { perBreak: number; resupplies: number } {
  const b = SUPPLY_BASE[band] ?? SUPPLY_BASE.cold;
  return { perBreak: r26 === 'fast' ? b.perBreak : Math.floor((b.perBreak * 2) / 3), resupplies: b.resupplies };
}
