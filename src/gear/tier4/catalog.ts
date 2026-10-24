// Act 3 gear (K10, plans/act3-K10.md section 2): the Wyrm-tempered tier 4 sets of design 9.1 to 9.5, their materials
// and the Act 3 reward items. Registered at module scope, like the Act 2 catalog, so ids exist before a save loads.
import type { ClassId } from '../../actors/classes';
import { LIST_PRICES } from '../../economy/prices';
import type { ItemDef } from '../../hud/ports';
import { registerItems } from '../../inventory/items';
import type { GearRow } from '../catalog';

/** Tier 4 materials. Scales and hide are only ever shed or sloughed: no loot table carries them (catalog.test scans). */
export const TIER4_MATERIALS = { scale: 'shed-wyrm-scale', hide: 'wyrm-hide', rimeIron: 'rime-iron' } as const;

const row = (id: string, cls: ClassId | readonly ClassId[], slot: GearRow['slot'], stat: number, price: number): GearRow => ({
  id,
  classes: typeof cls === 'string' ? [cls] : cls,
  slot,
  tier: 4,
  sockets: 1,
  stat,
  price,
});

/** About 40% above tier 3, so a tier 4 piece at +0 beats its tier 3 piece at +5 (+25%). Prices are sell-back only. */
export const TIER4_ROWS: readonly GearRow[] = [
  row('wyrm-tempered-oathblade', 'knight', 'weapon', 48, 1200),
  row('badge-shield-of-the-keeper', 'knight', 'offhand', 16, 900),
  row('wyrmscale-plate', 'knight', 'armour', 20, 900),
  row('wyrm-tempered-hewer', 'warden', 'weapon', 50, 1200),
  row('wyrmscale-mantle', 'warden', 'armour', 20, 900),
  row('wyrm-tempered-staff', 'emberwright', 'weapon', 44, 1200),
  row('wyrm-silk-robe', 'emberwright', 'armour', 17, 900),
  row('wyrm-tempered-claws', 'ashblade', 'weapon', 45, 1200),
  row('wyrmhide-jerkin', 'ashblade', 'armour', 17, 900),
  row('wyrm-tempered-arbalest', 'pathfinder', 'weapon', 47, 1200),
  row('wyrmhide-coat', 'pathfinder', 'armour', 18, 900),
];

/** Reward gear the quest threads grant (K12, K13): a tier 4 row takes sockets like a forged piece. */
export const TIER4_REWARD_ROWS: readonly GearRow[] = [
  row('rimewood-haft', ['warden', 'knight'], 'weapon', 46, 1000), // R16
  row('skarls-crossbow', 'pathfinder', 'weapon', 50, 1100), // D06
  { id: 'ranger-longbow', classes: ['pathfinder'], slot: 'weapon', tier: 3, stat: 40, price: 700 }, // R14 recolour
  { id: 'reed-armour', classes: ['knight', 'warden', 'emberwright', 'ashblade', 'pathfinder'], slot: 'armour', tier: 3, stat: 15, price: 500 }, // R12
];

/** Tier 3 piece to its tier 4 piece. */
export const TIER4_RECIPES: Readonly<Record<string, string>> = {
  'ashforged-longsword': 'wyrm-tempered-oathblade',
  'spike-shield': 'badge-shield-of-the-keeper',
  ashplate: 'wyrmscale-plate',
  'ashforged-cleaver': 'wyrm-tempered-hewer',
  'ashplate-harness': 'wyrmscale-mantle',
  'ashforged-staff': 'wyrm-tempered-staff',
  'emberthread-robe': 'wyrm-silk-robe',
  'ashforged-fangs': 'wyrm-tempered-claws',
  'soot-leathers': 'wyrmhide-jerkin',
  'ashforged-arbalest': 'wyrm-tempered-arbalest',
  'cinder-hood-and-coat': 'wyrmhide-coat',
};

/** Design 9.4 and 9.5 work hide; the rest scales. */
export function tier4MaterialFor(itemId: string): string {
  const r = [...TIER4_ROWS, ...TIER4_REWARD_ROWS].find((x) => x.id === itemId);
  const cls = r?.classes[0];
  return cls === 'ashblade' || cls === 'pathfinder' ? TIER4_MATERIALS.hide : TIER4_MATERIALS.scale;
}

const gearDef = (r: GearRow): ItemDef => ({
  id: r.id,
  nameKey: `item.${r.id}.name`,
  descKey: `item.${r.id}.desc`,
  kind: r.slot,
  slot: r.slot,
  stackMax: 1,
  stats: r.slot === 'weapon' ? { attack: r.stat } : { defense: r.stat },
  gearTier: r.tier,
  ...(r.sockets ? { sockets: r.sockets } : {}),
});

const other = (id: string, kind: ItemDef['kind'], rest: Partial<Pick<ItemDef, 'slot' | 'stackMax' | 'stats' | 'use' | 'gearTier'>> = {}): ItemDef => ({
  id,
  nameKey: `item.${id}.name`,
  descKey: `item.${id}.desc`,
  kind,
  stackMax: 1,
  ...rest,
});

/** Trinket ids with an Act 3 effect (the one trinket slot: each says so in its description). */
export const ACT3_TRINKETS = {
  knife: 'frostbrows-hunting-knife',
  plainKnife: 'hunting-knife',
  rimeCloak: 'rime-cloak',
  crampons: 'cliff-crampons',
  brooch: 'keepers-scale-brooch',
  motherScale: 'ember-mothers-scale',
} as const;

/** Key items K7 reads as owned (its ids, plans/act3-K7.md P2): never sold, never spent. */
export const ACT3_KEYS = { fenBoots: 'gear.fen-boots', ferryToken: 'key.ferry-token', saddlebags: 'ashmare-saddlebags' } as const;

export const TIER4_OTHER_ITEMS: readonly ItemDef[] = [
  other(TIER4_MATERIALS.scale, 'quest', { stackMax: 40 }),
  other(TIER4_MATERIALS.hide, 'quest', { stackMax: 40 }),
  other(TIER4_MATERIALS.rimeIron, 'quest', { stackMax: 40 }),
  other(ACT3_KEYS.fenBoots, 'quest'),
  other(ACT3_KEYS.ferryToken, 'quest'),
  other(ACT3_KEYS.saddlebags, 'quest'),
  // Plain-stat trinkets count toward defence (gear/combat.ts counts the trinket slot from tier 2 up).
  other(ACT3_TRINKETS.rimeCloak, 'trinket', { slot: 'trinket', stats: { defense: 4 }, gearTier: 4 }),
  other(ACT3_TRINKETS.crampons, 'trinket', { slot: 'trinket', stats: { defense: 3 }, gearTier: 4 }),
  other(ACT3_TRINKETS.knife, 'trinket', { slot: 'trinket' }),
  other(ACT3_TRINKETS.plainKnife, 'trinket', { slot: 'trinket' }),
  other(ACT3_TRINKETS.brooch, 'trinket', { slot: 'trinket' }),
  other(ACT3_TRINKETS.motherScale, 'trinket', { slot: 'trinket' }),
];

/** List prices (buy; sell is the shop's 40%). Key items have none, so they cannot be sold. */
export const TIER4_PRICES: Readonly<Record<string, number>> = {
  [TIER4_MATERIALS.scale]: 60,
  [TIER4_MATERIALS.hide]: 45,
  [TIER4_MATERIALS.rimeIron]: 80,
  [ACT3_TRINKETS.rimeCloak]: 220,
  [ACT3_TRINKETS.crampons]: 180,
  [ACT3_TRINKETS.knife]: 150,
  [ACT3_TRINKETS.plainKnife]: 90,
  [ACT3_TRINKETS.brooch]: 300,
  [ACT3_TRINKETS.motherScale]: 900,
};

export const TIER4_GEAR_ITEMS: readonly ItemDef[] = [...TIER4_ROWS, ...TIER4_REWARD_ROWS].map(gearDef);

for (const r of [...TIER4_ROWS, ...TIER4_REWARD_ROWS]) LIST_PRICES[r.id] = r.price;
for (const [id, p] of Object.entries(TIER4_PRICES)) LIST_PRICES[id] = p;

registerItems([...TIER4_GEAR_ITEMS, ...TIER4_OTHER_ITEMS]);

export const tier4Row = (id: string): GearRow | undefined => [...TIER4_ROWS, ...TIER4_REWARD_ROWS].find((r) => r.id === id);
