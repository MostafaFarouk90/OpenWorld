import type { FavourBand } from '../state/favour';

/** Band multipliers on list price (design section 3): Cold +20%, Banked list, Stoked -10%, Hearthbound -20%. */
export const BAND_PRICE: Readonly<Record<FavourBand, number>> = { cold: 1.2, banked: 1, stoked: 0.9, hearthbound: 0.8 };
export const SELL_SHARE = 0.4;

/** List prices. An item with no entry cannot be sold. */
export const LIST_PRICES: Record<string, number> = {
  'practice-sword': 8,
  'wooden-round-shield': 15,
  'squires-arming-sword': 60,
  'gauts-spare-tabard': 30,
  'gauts-spare-blade': 70,
  'hearth-stone-charm': 20,
  'hearth-bread': 10,
  'barley-cake': 6,
  'healing-flask': 30,
  'ford-guard-shield': 40,
  'training-weights': 20,
  'tobbs-lucky-whistle': 20,
  'priors-censer': 50,
};

export function listPrice(itemId: string): number | undefined {
  return Object.prototype.hasOwnProperty.call(LIST_PRICES, itemId) ? LIST_PRICES[itemId] : undefined;
}

/** Whole gold, at least 1. Odd list prices round to nearest. `discountPercent` is a flag discount off the buy price. */
export function bandPrice(list: number, band: FavourBand | null, discountPercent = 0): number {
  const mult = (band ? BAND_PRICE[band] : 1) * (1 - discountPercent / 100);
  return Math.max(1, Math.round(list * mult));
}

export function sellPrice(itemId: string): number | undefined {
  const list = listPrice(itemId);
  return list === undefined ? undefined : Math.max(1, Math.floor(list * SELL_SHARE));
}
