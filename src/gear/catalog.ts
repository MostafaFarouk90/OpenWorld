// Act 2 gear (design 9.1 to 9.5) plus the other items thread A10 owns (plans/act2-A10.md R2). Everything registers at
// module scope so ids exist before a save loads. Strings live in strings.en.ts.
import type { ClassId } from '../actors/classes';
import { LIST_PRICES } from '../economy/prices';
import type { ItemDef } from '../hud/ports';
import { registerItems } from '../inventory/items';

export interface GearRow {
  id: string;
  /** Which class kit the piece is made for (a vendor shows it dimmed to the others; the sale is not class-locked). */
  classes: readonly ClassId[];
  slot: 'weapon' | 'offhand' | 'armour';
  tier: 2 | 3;
  /** Attack for weapons, defense for armour and shields. */
  stat: number;
  price: number;
}

const row = (id: string, cls: ClassId, slot: GearRow['slot'], tier: 2 | 3, stat: number, price: number): GearRow => ({ id, classes: [cls], slot, tier, stat, price });

/** R1: strictly above the best Act 1 piece of the slot (weapon 18, armour 6, offhand 4); tier 3 above tier 2. Tier 3 prices are sell-back only. */
export const GEAR_ROWS: readonly GearRow[] = [
  row('halvard-steel-blade', 'knight', 'weapon', 2, 22, 240),
  row('rectangle-shield', 'knight', 'offhand', 2, 7, 140),
  row('brigandine', 'knight', 'armour', 2, 9, 190),
  row('ashforged-longsword', 'knight', 'weapon', 3, 34, 600),
  row('spike-shield', 'knight', 'offhand', 3, 11, 400),
  row('ashplate', 'knight', 'armour', 3, 14, 450),
  row('stonefold-greataxe', 'warden', 'weapon', 2, 24, 250),
  row('fur-lined-mail', 'warden', 'armour', 2, 9, 170),
  row('ashforged-cleaver', 'warden', 'weapon', 3, 36, 600),
  row('ashplate-harness', 'warden', 'armour', 3, 14, 450),
  row('archive-wand-of-oswin', 'emberwright', 'weapon', 2, 21, 230),
  row('scholars-robe', 'emberwright', 'armour', 2, 7, 160),
  row('ashforged-staff', 'emberwright', 'weapon', 3, 31, 600),
  row('emberthread-robe', 'emberwright', 'armour', 3, 12, 450),
  row('guild-twin-daggers', 'ashblade', 'weapon', 2, 21, 230),
  row('couriers-coat', 'ashblade', 'armour', 2, 8, 170),
  row('ashforged-fangs', 'ashblade', 'weapon', 3, 32, 600),
  row('soot-leathers', 'ashblade', 'armour', 3, 12, 450),
  row('greywatch-crossbow', 'pathfinder', 'weapon', 2, 22, 250),
  row('fen-leathers', 'pathfinder', 'armour', 2, 8, 160),
  row('ashforged-arbalest', 'pathfinder', 'weapon', 3, 33, 600),
  row('cinder-hood-and-coat', 'pathfinder', 'armour', 3, 13, 450),
];

const gearDef = (r: GearRow): ItemDef => ({
  id: r.id,
  nameKey: `item.${r.id}.name`,
  descKey: `item.${r.id}.desc`,
  kind: r.slot,
  slot: r.slot,
  stackMax: 1,
  stats: r.slot === 'weapon' ? { attack: r.stat } : { defense: r.stat },
  gearTier: r.tier,
});

const other = (id: string, kind: ItemDef['kind'], rest: Partial<Pick<ItemDef, 'slot' | 'stackMax' | 'stats' | 'use'>>): ItemDef => {
  return { id, nameKey: `item.${id}.name`, descKey: `item.${id}.desc`, kind, stackMax: 1, ...rest };
};

/** R2 (prices for these live in the economy's SHOP_LIST_PRICES): the non-gear ids A10 registers (A12 grants the saddle; A4 reads pickaxe, lamp-oil, ore; A6b owns the thrown Cooling Draught flow). */
export const OTHER_ITEMS: readonly ItemDef[] = [
  other('ashmare-saddle', 'quest', {}), // a reward, never sold
  other('iron-ore', 'quest', { stackMax: 40 }),
  other('coal', 'quest', { stackMax: 40 }),
  other('cinder-steel-ingot', 'quest', { stackMax: 20 }),
  other('pickaxe', 'quest', {}),
  other('lamp-oil', 'quest', { stackMax: 10 }),
  other('cooling-draught', 'quest', { stackMax: 10 }),
  other('ketta-wool-cloak', 'armour', { slot: 'armour', stats: { defense: 2 } }),
  other('maud-stew', 'consumable', { stackMax: 5, use: { healFlat: 35, drinkSeconds: 1 } }),
  other('maud-poultice', 'consumable', { stackMax: 5, use: { healFraction: 0.5, drinkSeconds: 1.2 } }),
  other('grisel-oath-sash', 'trinket', { slot: 'trinket' }),
  other('deepcore-pick', 'trinket', { slot: 'trinket' }),
];

export const GEAR_ITEMS: readonly ItemDef[] = GEAR_ROWS.map(gearDef);

for (const r of GEAR_ROWS) LIST_PRICES[r.id] = r.price;

registerItems([...GEAR_ITEMS, ...OTHER_ITEMS]);

export const gearRow = (id: string): GearRow | undefined => GEAR_ROWS.find((r) => r.id === id);
