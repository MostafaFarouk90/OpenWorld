import type { ClassId } from '../actors/classes';
import type { FavourBand, FavourTrack } from '../state/favour';
import { ACT3_DISCOUNTS, ACT3_SELL_FLAT, ACT3_SHOP_LIST_PRICES, ACT3_VENDORS } from './stock.act3';

export type VendorId =
  | 'wystan' | 'merrin' | 'edda' | 'wynn' | 'dunstan' | 'gerta' | 'ashdown'
  // Act 2 (v0.6 item 15). 'wenna' is reserved for Act 4.
  | 'aldous' | 'wenna' | 'slagg' | 'pike' | 'ketta' | 'maud' | 'osgar'
  // Act 3 (v0.7 item 16). Stock rows arrive with K10 and K13; 'ysmeryth' is band-stocked by the dragons' trust from `story.m32.complete`.
  | 'leofa' | 'dudda' | 'gytha' | 'thorgar' | 'eadgyth' | 'ansgar' | 'ysmeryth';

export interface StockLine {
  itemId: string;
  /** Limited stock; absent means unlimited. Limited lines do not restock within Act 1. */
  count?: number;
  /** Favour vendors only: the lowest band at which the line appears (default cold). */
  from?: FavourBand;
  /** The line appears only while this story flag matches: `equals` strictly, `not` as a mismatch, neither as truthy. */
  when?: StockWhen;
  /** Classes the piece is meant for; the shop dims it for others. It never blocks the sale. */
  classes?: readonly ClassId[];
  /** The line is hidden while the player holds any of the item (a single key item, such as the ferry token). */
  unlessHeld?: boolean;
}

export interface StockWhen {
  flag: string;
  equals?: unknown;
  not?: unknown;
}

/** Whether a line's `when` holds; a line with no `when` always does, and one with `when` never does without a flag reader. */
export function stockWhenHolds(when: StockWhen | undefined, flag: ((key: string) => unknown) | undefined): boolean {
  if (!when) return true;
  if (!flag) return false;
  const v = flag(when.flag);
  if (when.equals !== undefined) return v === when.equals;
  if (when.not !== undefined) return v !== when.not;
  return Boolean(v);
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

const A2: StockWhen = { flag: 'story.gate.a2' };
/** Tier 2 gear at Act 1 vendors: hidden until `story.gate.a2`, so Act 1 stock is unchanged. List prices come from the gear catalog. */
const DUNSTAN_TIER2: readonly StockLine[] = [
  { itemId: 'halvard-steel-blade', when: A2, classes: ['knight'] },
  { itemId: 'rectangle-shield', when: A2, classes: ['knight'] },
  { itemId: 'brigandine', when: A2, classes: ['knight'] },
  { itemId: 'stonefold-greataxe', when: A2, classes: ['warden'] },
  { itemId: 'fur-lined-mail', when: A2, classes: ['warden'] },
];
const MERRIN_TIER2: readonly StockLine[] = [
  { itemId: 'archive-wand-of-oswin', from: 'banked', when: A2, classes: ['emberwright'] },
  { itemId: 'scholars-robe', from: 'banked', when: A2, classes: ['emberwright'] },
];
const GERTA_TIER2: readonly StockLine[] = [
  { itemId: 'guild-twin-daggers', when: A2, classes: ['ashblade'] },
  { itemId: 'couriers-coat', when: A2, classes: ['ashblade'] },
];

export const VENDORS: Readonly<Record<VendorId, VendorDef>> = {
  // Act 3 (v0.7 item 16): K10's stock lives in stock.act3.ts.
  ...ACT3_VENDORS,
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
      ...MERRIN_TIER2,
    ],
  },
  edda: { id: 'edda', buys: false, lines: [{ itemId: 'hearth-bread' }, { itemId: 'barley-cake' }] },
  wynn: { id: 'wynn', buys: false, lines: [{ itemId: 'barley-cake' }] },
  dunstan: { id: 'dunstan', buys: false, lines: [{ itemId: 'ember-coal' }, ...DUNSTAN_TIER2] },
  gerta: { id: 'gerta', buys: true, lines: [{ itemId: 'oswin-lockpicks' }, ...GERTA_TIER2] },
  ashdown: { id: 'ashdown', buys: false, lines: [{ itemId: 'crossbow-bolts' }] },
  // Act 2 vendors (A10). 'wenna' is reserved for Act 4 and stays empty.
  aldous: {
    id: 'aldous',
    track: 'grisel',
    buys: false,
    lines: [
      { itemId: 'healing-flask' },
      { itemId: 'barley-cake' },
      { itemId: 'iron-ore', from: 'banked' },
      { itemId: 'coal', from: 'banked' },
      { itemId: 'lamp-oil', from: 'banked' },
      { itemId: 'cooling-draught', from: 'banked' },
      { itemId: 'grisel-oath-sash', count: 1, from: 'stoked' },
      { itemId: 'deepcore-pick', count: 1, from: 'hearthbound' },
    ],
  },
  wenna: { id: 'wenna', buys: false, lines: [] },
  slagg: {
    id: 'slagg',
    buys: true,
    lines: [{ itemId: 'pickaxe' }, { itemId: 'ember-coal' }, { itemId: 'iron-ore' }, { itemId: 'coal' }, { itemId: 'cinder-steel-ingot' }],
  },
  pike: { id: 'pike', buys: false, lines: [{ itemId: 'lamp-oil' }, { itemId: 'cooling-draught' }, { itemId: 'healing-flask' }] },
  ketta: {
    id: 'ketta',
    buys: false,
    lines: [
      { itemId: 'ketta-wool-cloak' },
      { itemId: 'hearth-bread', when: { flag: 'story.r05.choice', not: 'fox' } },
      { itemId: 'barley-cake', when: { flag: 'story.r05.choice', not: 'fox' } },
    ],
  },
  maud: {
    id: 'maud',
    buys: false,
    lines: [{ itemId: 'maud-stew' }, { itemId: 'maud-poultice' }, { itemId: 'hearth-bread' }, { itemId: 'barley-cake' }],
  },
  osgar: {
    id: 'osgar',
    buys: false,
    lines: [
      { itemId: 'healing-flask' },
      { itemId: 'hearth-bread' },
      { itemId: 'barley-cake' },
      { itemId: 'crossbow-bolts' },
      { itemId: 'iron-ore' },
      { itemId: 'coal' },
      { itemId: 'stonefold-greataxe', classes: ['warden'] },
      { itemId: 'fur-lined-mail', classes: ['warden'] },
      { itemId: 'greywatch-crossbow', classes: ['pathfinder'] },
      { itemId: 'fen-leathers', classes: ['pathfinder'] },
    ],
  },
};

/** Gold per unit at list. Items owned by thread 6 (quest items) are priced here; only the shop uses these. */
export const SHOP_LIST_PRICES: Readonly<Record<string, number>> = {
  'oswin-lockpicks': 25,
  'ember-coal': 12,
  'crossbow-bolts': 2,
  // Act 2 (A10). Gear and the R2 items the gear catalog prices itself are not repeated here.
  'iron-ore': 12,
  coal: 8,
  'cinder-steel-ingot': 120,
  pickaxe: 60,
  'lamp-oil': 8,
  'cooling-draught': 35,
  'ketta-wool-cloak': 90,
  'maud-stew': 25,
  'maud-poultice': 40,
  'grisel-oath-sash': 90,
  'deepcore-pick': 400,
  ...ACT3_SHOP_LIST_PRICES,
};

/** Flat sell prices that bypass the 40% rule and may apply to quest-kind items (materials sold at Slagg). */
export const SELL_FLAT: Readonly<Record<string, number>> = {
  'iron-ore': 8,
  // 5, not the spec's 6: Aldous at Hearthbound with the 15% union discount sells coal for 5, so 6 would be arbitrage.
  coal: 5,
  'cinder-steel-ingot': 40,
  ...ACT3_SELL_FLAT,
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

const UNION_VENDORS: readonly VendorId[] = ['aldous', 'slagg', 'pike'];

/** Flag-keyed buy discounts (Act 3 rows keyed by `story.r15.choice` are K10 / K13's to add); the best single match applies, then the band multiplier (R09/R10 never add). */
export const VENDOR_DISCOUNTS: readonly VendorDiscount[] = [
  { flag: 'story.r09.choice', value: 'miners', vendors: UNION_VENDORS, percent: 15 },
  { flag: 'story.r10.choice', value: 'compromise', vendors: UNION_VENDORS, percent: 10 },
  { flag: 'story.r10.choice', value: 'miners', vendors: UNION_VENDORS, percent: 15 },
  { flag: 'story.r10.choice', value: 'stewards', vendors: UNION_VENDORS, percent: 0 },
  ...ACT3_DISCOUNTS,
];

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
