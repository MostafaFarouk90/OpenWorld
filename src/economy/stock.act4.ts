// Act 4 L7 (plans/act4-L7.md section 3): Wenna as the Grisel favour vendor from M38, Wulfhild's Ashwalker band stock from
// M43, Hild at Ashgate, and Merrin's R20 discount. Merged into VENDORS by one spread each, like stock.act3.ts. Every
// `when` is read at quote time, so a choice flag re-derives across `save.loaded`.
import { ACT4_SHOP_ITEMS, ACT4_SHOP_LIST_PRICES, ASH_SHROUD_MASK, RAIN_FLASK } from '../items/act4/catalog';
import type { StockLine, VendorDef, VendorDiscount } from './stock';

/** Story flag values the Act 4 vendors read; each is pinned by a test. */
export const ACT4_FLAGS = {
  m38Complete: 'story.m38.complete',
  m41Complete: 'story.m41.complete',
  m42Complete: 'story.m42.complete',
  m43Complete: 'story.m43.complete',
  r20: { key: 'story.r20.choice', bribe: 'bribe', stealth: 'stealth', force: 'force' },
  r21: { key: 'story.r21.choice', all: 'all', leaders: 'leaders' },
} as const;

const R21_ALL: StockLine['when'] = { flag: ACT4_FLAGS.r21.key, equals: ACT4_FLAGS.r21.all };

/**
 * Wenna takes Aldous's Grisel stock and bands from M38 (design 8.2). R21 `all`: her miners brought the ore out, so she
 * adds cinder-steel ingots and rime-iron at every band. The unique pieces are not resold to a player who bought them from
 * Aldous. One line per item, so `Shop.line` never meets a duplicate.
 */
export const WENNA: VendorDef = {
  id: 'wenna',
  track: 'grisel',
  buys: false,
  lines: [
    { itemId: 'healing-flask' },
    { itemId: 'barley-cake' },
    { itemId: 'iron-ore', from: 'banked' },
    { itemId: 'coal', from: 'banked' },
    { itemId: 'cinder-steel-ingot', when: R21_ALL },
    { itemId: 'rime-iron', when: R21_ALL },
    { itemId: 'lamp-oil', from: 'banked' },
    { itemId: 'cooling-draught', from: 'banked' },
    { itemId: 'grisel-oath-sash', count: 1, from: 'stoked', unlessHeld: true },
    { itemId: 'deepcore-pick', count: 1, from: 'hearthbound', unlessHeld: true },
  ],
};

/** An Act 4 vendor row before L0's item 16 adds `wulfhild` and `hild` to `VendorId`. */
export type Act4VendorRow = Omit<VendorDef, 'id'> & { id: 'wulfhild' | 'hild' };

/** Wulfhild, the Ashwalker favour vendor from M43 (design 8.2: basic, full, rare and the pyre-paint, master and one unique). */
export const WULFHILD: Act4VendorRow = {
  id: 'wulfhild',
  track: 'ashwalkers',
  buys: true,
  lines: [
    { itemId: 'healing-flask' },
    { itemId: RAIN_FLASK },
    { itemId: 'rope' },
    { itemId: ACT4_SHOP_ITEMS.poultice, from: 'banked' },
    { itemId: 'rime-iron', from: 'banked' },
    { itemId: 'wyrm-hide', from: 'banked' },
    { itemId: ACT4_SHOP_ITEMS.ashHideWraps, count: 1, from: 'stoked' },
    { itemId: ACT4_SHOP_ITEMS.pyrePaint, count: 1, from: 'stoked', unlessHeld: true },
    { itemId: ACT4_SHOP_ITEMS.pyreCloak, count: 1, from: 'hearthbound', unlessHeld: true },
  ],
};

/** Hild Ropewright at Ashgate: masks, Rain Flasks and rope. The mask is a replacement only (M42 gives the first). */
export const HILD: Act4VendorRow = {
  id: 'hild',
  buys: false,
  lines: [
    { itemId: RAIN_FLASK },
    { itemId: 'rope' },
    { itemId: 'healing-flask' },
    { itemId: ASH_SHROUD_MASK, when: { flag: ACT4_FLAGS.m42Complete }, unlessHeld: true },
  ],
};

/** Merrin's R20 discount (plan 2.4): bribe 15%, stealth 10%, force none (an explicit row, like R10 `stewards`). */
export const ACT4_DISCOUNTS: readonly VendorDiscount[] = [
  { flag: ACT4_FLAGS.r20.key, value: ACT4_FLAGS.r20.bribe, vendors: ['merrin'], percent: 15 },
  { flag: ACT4_FLAGS.r20.key, value: ACT4_FLAGS.r20.stealth, vendors: ['merrin'], percent: 10 },
  { flag: ACT4_FLAGS.r20.key, value: ACT4_FLAGS.r20.force, vendors: ['merrin'], percent: 0 },
];

export { ACT4_SHOP_LIST_PRICES };
