import type { StockLine, VendorDef, VendorDiscount, VendorId } from './stock';

/** Story flag values the Act 3 vendors read; each is cross-checked with the quest threads and pinned by a test. */
export const ACT3_FLAGS = {
  r12: { key: 'story.r12.choice', cut: 'cut' },
  r14: { key: 'story.r14.choice', returned: 'returned' },
  r15: { key: 'story.r15.choice', lodge: 'lodge' },
  m25Complete: 'story.m25.complete',
  m32Complete: 'story.m32.complete',
} as const;

const M32: StockLine['when'] = { flag: ACT3_FLAGS.m32Complete };

const act3 = (id: VendorId, buys: boolean, lines: readonly StockLine[], track?: VendorDef['track']): VendorDef => ({
  id,
  buys,
  lines,
  ...(track ? { track } : {}),
});

export const ACT3_VENDORS = {
  leofa: act3('leofa', false, [
    { itemId: 'crossbow-bolts' },
    { itemId: 'master-bolts', when: { flag: ACT3_FLAGS.r14.key, equals: ACT3_FLAGS.r14.returned } },
  ]),
  dudda: act3('dudda', false, [
    { itemId: 'fishing-bait' },
    { itemId: 'fishing-tackle' },
    { itemId: 'key.ferry-token', unlessHeld: true },
    { itemId: 'reed-basket', when: { flag: ACT3_FLAGS.r12.key, equals: ACT3_FLAGS.r12.cut } },
  ]),
  gytha: act3('gytha', false, [
    { itemId: 'healing-flask' },
    { itemId: 'cooling-draught' },
    { itemId: 'bog-myrtle' },
    { itemId: 'sundew' },
    { itemId: 'mire-lily' },
    { itemId: 'fen-salve', when: { flag: ACT3_FLAGS.m25Complete } },
  ]),
  thorgar: act3('thorgar', true, [
    { itemId: 'rime-cloak' },
    { itemId: 'cliff-crampons' },
    { itemId: 'rope' },
    { itemId: 'hawk-jerky' },
    { itemId: 'rime-iron' },
    { itemId: 'wyrm-hide' },
    { itemId: 'shed-wyrm-scale', count: 9 },
  ]),
  eadgyth: act3('eadgyth', false, [{ itemId: 'hunting-knife' }]),
  ansgar: act3('ansgar', false, [{ itemId: 'monastery-candle' }]),
  ysmeryth: act3(
    'ysmeryth',
    false,
    [
      { itemId: 'shed-wyrm-scale', when: M32 },
      { itemId: 'wyrm-hide', when: M32 },
      { itemId: 'rime-iron', from: 'banked', when: M32 },
      { itemId: 'keepers-scale-brooch', count: 1, from: 'stoked', when: M32 },
      { itemId: 'ember-mothers-scale', count: 1, from: 'hearthbound', when: M32 },
    ],
    'dragons',
  ),
} as const satisfies Record<string, VendorDef>;

/** Thorgar's lodge discount (R15): the best single match applies, then the band multiplier. */
export const ACT3_DISCOUNTS: readonly VendorDiscount[] = [
  { flag: ACT3_FLAGS.r15.key, value: ACT3_FLAGS.r15.lodge, vendors: ['thorgar'], percent: 15 },
];

/** Gold per unit for the Act 3 items the gear catalog does not price (materials, rewards and gear price themselves). */
export const ACT3_SHOP_LIST_PRICES: Readonly<Record<string, number>> = {
  'master-bolts': 6,
  'fishing-bait': 2,
  'fishing-tackle': 15,
  'key.ferry-token': 20,
  'reed-basket': 18,
  'bog-myrtle': 12,
  sundew: 12,
  'mire-lily': 14,
  'fen-salve': 40,
  rope: 20,
  'hawk-jerky': 10,
  'monastery-candle': 4,
};

/** Flat sell prices for Act 3 trade goods. */
export const ACT3_SELL_FLAT: Readonly<Record<string, number>> = { 'reed-basket': 12 };
