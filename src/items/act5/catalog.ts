// Act 5 N7 (plans/act5-N7.md section 2): the Act 5 rewards, Maud's rim food and the Oswin flask. Registered at module
// scope so ids exist before a save loads. Keepsakes are quest kind with no price, so the shop never buys them back.
import { LIST_PRICES } from '../../economy/prices';
import type { ItemDef } from '../../hud/ports';
import { registerItems } from '../../inventory/items';
import { FORGE_HEART_FRAGMENT } from '../../gear/tier5/fragments';

export const ACT5_KEEPSAKES = {
  alliedBanners: 'key.allied-banners',
  ansgarsGong: 'key.ansgars-gong',
  keepersCall: 'key.keepers-call',
  siegeMedal: 'key.siege-medal',
  minersLastPick: 'key.miners-last-pick',
  balladOfCael: 'key.ballad-of-cael',
  edricsSeal: 'key.edrics-seal',
  stokersKey: 'key.stokers-key',
  endingLastEmber: 'key.ending-lastember',
  endingLongDawn: 'key.ending-longdawn',
} as const;

/** Wearable rewards: one trinket slot, so each is a choice (tier 5 trinkets count their defence). */
export const ACT5_TRINKETS = {
  stokersGloves: 'stokers-gloves',
  cinderproofMantle: 'cinderproof-mantle',
  coolingBead: 'cooling-bead',
  walkerPyreMask: 'walker-pyre-mask',
  regentsGauntlet: 'regents-gauntlet',
  hammerRune: 'hammer-rune',
  emberCrown: 'ember-crown',
} as const;

/** Defence of each wearable (plan 2). */
export const ACT5_TRINKET_DEFENCE: Readonly<Record<string, number>> = {
  [ACT5_TRINKETS.stokersGloves]: 9,
  [ACT5_TRINKETS.cinderproofMantle]: 6,
  [ACT5_TRINKETS.coolingBead]: 4,
  [ACT5_TRINKETS.walkerPyreMask]: 5,
  [ACT5_TRINKETS.regentsGauntlet]: 12,
  [ACT5_TRINKETS.hammerRune]: 6,
  [ACT5_TRINKETS.emberCrown]: 10,
};

/** R26's reward: a sealed purse note that any buying vendor pays this much for (flat). */
export const OSWIN_BOUNTY = 'oswin-bounty';
export const OSWIN_BOUNTY_GOLD = 450;
export const OSWIN_FLASK = 'oswin-flask';
export const MAUD_RIM_FOOD = { hotpot: 'rim-hotpot', broth: 'ember-broth' } as const;
/** Foods that light Hearty (the inn's food buff) when eaten. `maud-stew` is the shipped one. */
export const HEARTY_FOODS: readonly string[] = ['maud-stew', MAUD_RIM_FOOD.hotpot, MAUD_RIM_FOOD.broth];

const def = (id: string, kind: ItemDef['kind'], rest: Partial<Pick<ItemDef, 'slot' | 'stackMax' | 'stats' | 'use' | 'gearTier'>> = {}): ItemDef => ({
  id,
  nameKey: `item.${id}.name`,
  descKey: `item.${id}.desc`,
  kind,
  stackMax: 1,
  ...rest,
});

export const ACT5_ITEMS: readonly ItemDef[] = [
  ...Object.values(ACT5_KEEPSAKES).map((id) => def(id, 'quest')),
  ...Object.entries(ACT5_TRINKET_DEFENCE).map(([id, defence]) => def(id, 'trinket', { slot: 'trinket', stats: { defense: defence }, gearTier: 5 })),
  def(OSWIN_BOUNTY, 'quest'),
  def(OSWIN_FLASK, 'consumable', { stackMax: 10, use: { healFraction: 0.35, drinkSeconds: 1, burnRelief: 10 } }),
  def(MAUD_RIM_FOOD.hotpot, 'consumable', { stackMax: 5, use: { healFlat: 30, drinkSeconds: 1 } }),
  def(MAUD_RIM_FOOD.broth, 'consumable', { stackMax: 5, use: { noHeal: true, drinkSeconds: 1, burnRelief: 25 } }),
];

/** Shop-only buy prices (quest-kind items need them; the fragment has none and is never sold). */
export const ACT5_SHOP_LIST_PRICES: Readonly<Record<string, number>> = {};
export const ACT5_LIST_PRICES: Readonly<Record<string, number>> = {
  [MAUD_RIM_FOOD.hotpot]: 30,
  [MAUD_RIM_FOOD.broth]: 40,
};
/** Flat sell prices for quest-kind items. */
export const ACT5_SELL_FLAT: Readonly<Record<string, number>> = { [OSWIN_BOUNTY]: OSWIN_BOUNTY_GOLD };

for (const [id, p] of Object.entries(ACT5_LIST_PRICES)) LIST_PRICES[id] = p;
registerItems(ACT5_ITEMS);

/** Quest id to its reward item ids (M56 lists both ending keepsakes; grant `endingKeepsakeFor`). Fragments are paid separately. */
export const ACT5_REWARDS: Readonly<Record<string, readonly string[]>> = {
  m47: [ACT5_TRINKETS.stokersGloves],
  m48: [ACT5_TRINKETS.cinderproofMantle, FORGE_HEART_FRAGMENT],
  m49: [ACT5_KEEPSAKES.alliedBanners],
  r26: [OSWIN_BOUNTY],
  r29: [ACT5_KEEPSAKES.ansgarsGong],
  m50: [ACT5_TRINKETS.coolingBead, FORGE_HEART_FRAGMENT],
  m51: [ACT5_KEEPSAKES.keepersCall],
  m52: [ACT5_KEEPSAKES.siegeMedal],
  r27: [ACT5_KEEPSAKES.minersLastPick],
  r28: [ACT5_TRINKETS.walkerPyreMask],
  r30: [ACT5_KEEPSAKES.balladOfCael],
  m53: [ACT5_KEEPSAKES.edricsSeal],
  d09: [ACT5_TRINKETS.regentsGauntlet, FORGE_HEART_FRAGMENT, FORGE_HEART_FRAGMENT],
  m54: [ACT5_KEEPSAKES.stokersKey],
  m55: [ACT5_TRINKETS.hammerRune],
  d10: [ACT5_TRINKETS.emberCrown],
  m56: [ACT5_KEEPSAKES.endingLastEmber, ACT5_KEEPSAKES.endingLongDawn],
};

/** M56's keepsake by `story.m56.choice` (`rekindle` is The Last Ember, `let-it-die` The Long Dawn); null for anything else. */
export function endingKeepsakeFor(choice: unknown): string | null {
  if (choice === 'rekindle') return ACT5_KEEPSAKES.endingLastEmber;
  if (choice === 'let-it-die') return ACT5_KEEPSAKES.endingLongDawn;
  return null;
}
