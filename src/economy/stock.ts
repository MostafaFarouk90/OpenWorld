import type { FavourBand, FavourTrack } from '../state/favour';

export type VendorId = 'wystan' | 'merrin' | 'edda' | 'wynn' | 'dunstan' | 'gerta' | 'ashdown';

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
};

/** Gold per unit at list. Items owned by thread 6 (quest items) are priced here; only the shop uses these. */
export const SHOP_LIST_PRICES: Readonly<Record<string, number>> = {
  'oswin-lockpicks': 25,
  'ember-coal': 12,
  'crossbow-bolts': 2,
};

export const VENDOR_IDS = Object.keys(VENDORS) as VendorId[];
export const isVendorId = (v: unknown): v is VendorId => typeof v === 'string' && Object.prototype.hasOwnProperty.call(VENDORS, v);
