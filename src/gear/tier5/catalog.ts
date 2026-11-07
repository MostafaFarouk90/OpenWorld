// Act 5 N7 (plans/act5-N7.md section 4): Sunforged tier 5 gear of design 9.6, forged at Alric's rim anvil from a tier 4
// piece, forge-heart fragments and gold. Registered at module scope, like the tier 4 catalog, so ids exist before a save loads.
import type { ClassId } from '../../actors/classes';
import { LIST_PRICES } from '../../economy/prices';
import type { ItemDef } from '../../hud/ports';
import { registerItems } from '../../inventory/items';
import type { GearRow } from '../catalog';

const row = (id: string, cls: ClassId, slot: GearRow['slot'], stat: number, price: number): GearRow => ({ id, classes: [cls], slot, tier: 5, sockets: 2, stat, price });

/** About 25% over tier 4, so a tier 5 piece at +0 beats its tier 4 piece at +5. Prices are sell-back only. */
export const TIER5_ROWS: readonly GearRow[] = [
  row('sunforged-dawnbrand', 'knight', 'weapon', 62, 2400),
  row('sunforged-aegis', 'knight', 'offhand', 21, 1500),
  row('sunplate', 'knight', 'armour', 26, 1800),
  row('sunforged-worldsplitter', 'warden', 'weapon', 64, 2400),
  row('sun-tanned-warplate', 'warden', 'armour', 26, 1800),
  row('sunforged-scepter', 'emberwright', 'weapon', 56, 2400),
  row('sunweave-robe', 'emberwright', 'armour', 22, 1800),
  row('sunforged-sparks', 'ashblade', 'weapon', 58, 2400),
  row('cinderwraith-coat', 'ashblade', 'armour', 22, 1800),
  row('sunforged-longbolt', 'pathfinder', 'weapon', 61, 2400),
  row('rimwalkers-cloak', 'pathfinder', 'armour', 23, 1800),
];

export const SUNFORGED_IDS: readonly string[] = TIER5_ROWS.map((r) => r.id);

/** Tier 4 piece (or the M39 Oathblade) to its Sunforged piece. */
export const TIER5_RECIPES: Readonly<Record<string, string>> = {
  'wyrm-tempered-oathblade': 'sunforged-dawnbrand',
  'gauts-oathblade': 'sunforged-dawnbrand',
  'badge-shield-of-the-keeper': 'sunforged-aegis',
  'wyrmscale-plate': 'sunplate',
  'wyrm-tempered-hewer': 'sunforged-worldsplitter',
  'wyrmscale-mantle': 'sun-tanned-warplate',
  'wyrm-tempered-staff': 'sunforged-scepter',
  'wyrm-silk-robe': 'sunweave-robe',
  'wyrm-tempered-claws': 'sunforged-sparks',
  'wyrmhide-jerkin': 'cinderwraith-coat',
  'wyrm-tempered-arbalest': 'sunforged-longbolt',
  'wyrmhide-coat': 'rimwalkers-cloak',
};

export const isTier5Recipe = (fromId: string): boolean => Object.prototype.hasOwnProperty.call(TIER5_RECIPES, fromId);

const gearDef = (r: GearRow): ItemDef => ({
  id: r.id,
  nameKey: `item.${r.id}.name`,
  descKey: `item.${r.id}.desc`,
  kind: r.slot,
  slot: r.slot,
  stackMax: 1,
  stats: r.slot === 'weapon' ? { attack: r.stat } : { defense: r.stat },
  gearTier: 5,
  sockets: 2,
});

for (const r of TIER5_ROWS) LIST_PRICES[r.id] = r.price;
registerItems(TIER5_ROWS.map(gearDef));

export const tier5Row = (id: string): GearRow | undefined => TIER5_ROWS.find((r) => r.id === id);
