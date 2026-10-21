import type { FavourBand, FavourTrack } from '../state/favour';

export type VendorId =
  | 'wystan' | 'merrin' | 'edda' | 'wynn' | 'dunstan' | 'gerta' | 'ashdown'
  // Act 2 (v0.6 item 15). 'wenna' is reserved for Act 4.
  | 'aldous' | 'wenna' | 'slagg' | 'pike' | 'ketta' | 'maud' | 'osgar';

export interface StockLine {
  itemId: string;
  /** Limited stock; absent means unlimited. Limited lines do not restock within Act 1. */
  count?: number;
  /** Favour vendors only: the lowest band at which the line appears (default cold). */
  from?: FavourBand;
}

export interface VendorDef {
  id: VendorId;
  /** Favour track whose band sets the stock and prices; absent for plain shops. */
  track?: FavourTrack;
  lines: readonly StockLine[];
  /** Whether the vendor buys from the player. */
  buys: boolean;
}

export const BAND_ORDER: readonly FavourBand[] = ['cold', 'banked', 'stoked', 'hearthbound'];
export const bandAtLeast = (band: FavourBand, from: FavourBand | undefined): boolean =>
  BAND_ORDER.indexOf(band) >= BAND_ORDER.indexOf(from ?? 'cold');

export const VENDORS: Readonly<Record<VendorId, VendorDef>> = {
  wystan: {
    id: 'wystan',
    track: 'halvard',
    buys: true,
    lines: [
      { itemId: 'healing-flask' },
      { itemId: 'hearth-bread' },
      { itemId: 'marshals-longsword', count: 1, from: 'banked' },
      { itemId: 'marshals-kite-shield', count: 1, from: 'banked' },
      { itemId: 'halvard-oath-sash', count: 1, from: 'stoked' },
      { itemId: 'marshals-mantle', count: 1, from: 'hearthbound' },
    ],
  },
  merrin: {
    id: 'merrin',
    track: 'oswin',
    buys: true,
    lines: [
      { itemId: 'healing-flask' },
      { itemId: 'barley-cake' },
      { itemId: 'oswin-ledger-dagger', count: 1, from: 'banked' },
      { itemId: 'merchants-coat', count: 1, from: 'banked' },
      { itemId: 'oswin-oath-sash', count: 1, from: 'stoked' },
      { itemId: 'ledger-lens', count: 1, from: 'hearthbound' },
    ],
  },
  edda: { id: 'edda', buys: false, lines: [{ itemId: 'hearth-bread' }, { itemId: 'barley-cake' }] },
  wynn: { id: 'wynn', buys: false, lines: [{ itemId: 'barley-cake' }] },
  dunstan: { id: 'dunstan', buys: false, lines: [{ itemId: 'ember-coal' }] },
  gerta: { id: 'gerta', buys: true, lines: [{ itemId: 'oswin-lockpicks' }] },
  ashdown: { id: 'ashdown', buys: false, lines: [{ itemId: 'crossbow-bolts' }] },
  // Act 2 vendors: empty until A10 fills the lines. 'wenna' is reserved for Act 4 and stays empty.
  aldous: { id: 'aldous', buys: false, lines: [] },
  wenna: { id: 'wenna', buys: false, lines: [] },
  slagg: { id: 'slagg', buys: true, lines: [] },
  pike: { id: 'pike', buys: false, lines: [] },
  ketta: { id: 'ketta', buys: false, lines: [] },
  maud: { id: 'maud', buys: false, lines: [] },
  osgar: { id: 'osgar', buys: false, lines: [] },
};

/** Gold per unit at list. Items owned by thread 6 (quest items) are priced here; only the shop uses these. */
export const SHOP_LIST_PRICES: Readonly<Record<string, number>> = {
  'oswin-lockpicks': 25,
  'ember-coal': 12,
  'crossbow-bolts': 2,
};

export const VENDOR_IDS = Object.keys(VENDORS) as VendorId[];
export const isVendorId = (v: unknown): v is VendorId => typeof v === 'string' && Object.prototype.hasOwnProperty.call(VENDORS, v);

export interface VendorDiscount {
  /** A story flag (`story.r09.choice`, `story.r10.choice`). Truthy matches, or equal to `value` when that is given. */
  flag: string;
  value?: string | number | boolean;
  vendors: readonly VendorId[];
  /** Off the buy price, 0..100. */
  percent: number;
}

/** Flag-keyed buy discounts. A10 fills it. */
export const VENDOR_DISCOUNTS: readonly VendorDiscount[] = [];

/** The best matching discount percent for a vendor (0 when none); the buy price only, never sell or buy-back. */
export function discountPercent(
  vendorId: VendorId,
  flag: (key: string) => unknown,
  table: readonly VendorDiscount[] = VENDOR_DISCOUNTS,
): number {
  let best = 0;
  for (const d of table) {
    if (!d.vendors.includes(vendorId) || !(d.percent > best)) continue;
    const v = flag(d.flag);
    if (d.value === undefined ? Boolean(v) : v === d.value) best = Math.min(100, d.percent);
  }
  return best;
}
