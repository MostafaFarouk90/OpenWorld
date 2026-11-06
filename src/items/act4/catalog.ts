// Act 4 L7 (plans/act4-L7.md section 2): the Act 4 rewards, the Ashwalker and Ashgate shop items and the Rain Flask.
// Registered at module scope, like the Act 3 catalog, so ids exist before a save loads. Keepsakes are quest kind with no
// price: the shop refuses to buy an unpriced quest item (`cannot-sell`), so they are never sold and never spent.
import { LIST_PRICES } from '../../economy/prices';
import type { ItemDef } from '../../hud/ports';
import { registerItems } from '../../inventory/items';

/** Gaut's Oathblade (Q3): the Knight's sword and the trinket every other class carries. */
export const OATHBLADE = {
  sword: 'gauts-oathblade',
  carried: 'gauts-oathblade-carried',
  /** Tier 4 at +5 with Sworn (the Wyrm-tempered Oathblade's stat). */
  attack: 48,
  temper: 5,
  affix: 'sworn',
  /** The carried form: +10% poise damage on the player's hits while it is in the trinket slot. */
  poiseBonus: 0.1,
} as const;

/** L3 reads this exact id (or `story.m42.complete`): held, it removes the storm's visibility penalty. */
export const ASH_SHROUD_MASK = 'ash-shroud-mask';
/** L5 puts this in the Waste Strider's Calm `offerings`. */
export const RAIN_FLASK = 'rain-flask';

export const ACT4_KEEPSAKES = {
  councilSeal: 'key.council-seal',
  oswinSilverKey: 'key.oswin-silver-key',
  bannerStandard: 'key.banner-standard',
  silverConvoyWrit: 'key.silver-convoy-writ',
  wennasSignet: 'key.wennas-signet',
  practiceBladeLight: 'key.edrics-practice-blade-light',
  practiceBladeHeavy: 'key.edrics-practice-blade-heavy',
  watchSeal: 'key.watch-seal',
  engineGear: 'key.engine-gear',
  bondCord: 'key.bond-cord',
  rooksWhistle: 'key.rooks-whistle',
  edricsMap: 'key.edrics-map',
  walkerTattoo: 'key.walker-tattoo',
  musicBox: 'key.music-box',
  ebbasCandle: 'key.ebbas-candle',
  chimeKey: 'key.chime-key',
  eormensCrownShard: 'key.eormens-crown-shard',
} as const;

export const WATERSKIN_OF_RAIN = 'waterskin-of-rain';
export const RIMWARD_BOOTS = 'rimward-boots';

/** The Ashwalker and Ashgate shop items (invented, Q6; logged in design/changes-applied.md). */
export const ACT4_SHOP_ITEMS = {
  pyrePaint: 'walker-pyre-paint',
  pyreCloak: 'walker-pyre-cloak',
  ashHideWraps: 'ash-hide-wraps',
  poultice: 'walker-poultice',
} as const;

/** R22's reward by `story.r22.choice` (`light` or `heavy`); null for anything else. */
export function practiceBladeFor(choice: unknown): string | null {
  if (choice === 'light') return ACT4_KEEPSAKES.practiceBladeLight;
  if (choice === 'heavy') return ACT4_KEEPSAKES.practiceBladeHeavy;
  return null;
}

/**
 * The reward item ids of each Act 4 quest (plan 2.1 to 2.3), for L10 and L11 to import. R22 lists both blades (grant
 * the one `practiceBladeFor` names); M39 lists both Oathblade forms (grant through `grantOathblade`); D08's Crown Shard is
 * the destroyed path's. D07 and D08 also pay a shard-gem through the K10 boss table (gear/sockets/tuning.ts).
 */
export const ACT4_REWARDS: Readonly<Record<string, readonly string[]>> = {
  m35: [ACT4_KEEPSAKES.councilSeal],
  m36: [ACT4_KEEPSAKES.oswinSilverKey],
  r19: [ACT4_KEEPSAKES.bannerStandard],
  r20: [ACT4_KEEPSAKES.silverConvoyWrit],
  r21: [ACT4_KEEPSAKES.wennasSignet],
  r22: [ACT4_KEEPSAKES.practiceBladeLight, ACT4_KEEPSAKES.practiceBladeHeavy],
  r23: [ACT4_KEEPSAKES.watchSeal],
  d07: [ACT4_KEEPSAKES.engineGear],
  m37: [ACT4_KEEPSAKES.bondCord],
  m38: [],
  m39: [OATHBLADE.sword, OATHBLADE.carried],
  m40: [ACT4_KEEPSAKES.rooksWhistle],
  m41: [ACT4_KEEPSAKES.edricsMap],
  m42: [ASH_SHROUD_MASK],
  m43: [ACT4_KEEPSAKES.walkerTattoo],
  m44: [ACT4_KEEPSAKES.musicBox],
  r25: [ACT4_KEEPSAKES.ebbasCandle],
  r24: [WATERSKIN_OF_RAIN],
  m45: [ACT4_KEEPSAKES.chimeKey],
  d08: [ACT4_KEEPSAKES.eormensCrownShard],
  m46: [RIMWARD_BOOTS],
};

const def = (id: string, kind: ItemDef['kind'], rest: Partial<Pick<ItemDef, 'slot' | 'stackMax' | 'stats' | 'use' | 'gearTier' | 'sockets'>> = {}): ItemDef => ({
  id,
  nameKey: `item.${id}.name`,
  descKey: `item.${id}.desc`,
  kind,
  stackMax: 1,
  ...rest,
});

export const ACT4_ITEMS: readonly ItemDef[] = [
  ...Object.values(ACT4_KEEPSAKES).map((id) => def(id, 'quest')),
  def(ASH_SHROUD_MASK, 'quest'),
  // Tier 4 at +5 (granted tempered with Sworn); sockets by the tier 4 rule, two at +5.
  def(OATHBLADE.sword, 'weapon', { slot: 'weapon', stats: { attack: OATHBLADE.attack }, gearTier: 4, sockets: 1 }),
  def(OATHBLADE.carried, 'trinket', { slot: 'trinket' }),
  def(WATERSKIN_OF_RAIN, 'consumable', { use: { healFraction: 0.4, drinkSeconds: 1.2, burnRelief: 15 } }),
  def(RIMWARD_BOOTS, 'trinket', { slot: 'trinket', stats: { defense: 6 }, gearTier: 4 }),
  def(RAIN_FLASK, 'quest', { stackMax: 10 }),
  def(ACT4_SHOP_ITEMS.pyrePaint, 'trinket', { slot: 'trinket' }),
  def(ACT4_SHOP_ITEMS.pyreCloak, 'trinket', { slot: 'trinket', stats: { defense: 8 }, gearTier: 4 }),
  def(ACT4_SHOP_ITEMS.ashHideWraps, 'armour', { slot: 'armour', stats: { defense: 18 }, gearTier: 4, sockets: 1 }),
  def(ACT4_SHOP_ITEMS.poultice, 'consumable', { stackMax: 5, use: { noHeal: true, burnRelief: 20 } }),
];

/** Gear and consumable list prices (sell is the shop's 40%). Rewards have none, so they can never be sold. */
export const ACT4_LIST_PRICES: Readonly<Record<string, number>> = {
  [ACT4_SHOP_ITEMS.pyrePaint]: 90,
  [ACT4_SHOP_ITEMS.pyreCloak]: 900,
  [ACT4_SHOP_ITEMS.ashHideWraps]: 950,
  [ACT4_SHOP_ITEMS.poultice]: 45,
};

/** Shop-only buy prices for quest-kind items: the shop never buys a quest item back without a SELL_FLAT entry. */
export const ACT4_SHOP_LIST_PRICES: Readonly<Record<string, number>> = {
  [RAIN_FLASK]: 14,
  // Hild's replacement mask, offered only after M42 and only while none is held.
  [ASH_SHROUD_MASK]: 120,
};

for (const [id, p] of Object.entries(ACT4_LIST_PRICES)) LIST_PRICES[id] = p;

registerItems(ACT4_ITEMS);
