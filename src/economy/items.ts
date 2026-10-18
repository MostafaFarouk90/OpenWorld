// Items the economy owns (stock gear, cosmetics, the Hearty food). Quest items (lockpicks, Ember Coal, bolts, Aldith's
// Stout) belong to thread 6 and are only referenced by id; a stock line whose item is unregistered is skipped.
import type { ItemDef } from '../hud/ports';
import { registerItems } from '../inventory/items';
import { LIST_PRICES } from './prices';

const gear = (id: string, kind: ItemDef['kind'], slot: ItemDef['slot'], stats: ItemDef['stats']): ItemDef => ({
  id,
  nameKey: `item.${id}.name`,
  descKey: `item.${id}.desc`,
  kind,
  slot,
  stackMax: 1,
  stats,
});

export const ECONOMY_ITEMS: readonly ItemDef[] = [
  gear('marshals-longsword', 'weapon', 'weapon', { attack: 18 }),
  gear('marshals-kite-shield', 'offhand', 'offhand', { defense: 4 }),
  gear('halvard-oath-sash', 'trinket', 'trinket', undefined),
  gear('marshals-mantle', 'armour', 'armour', { defense: 6 }),
  gear('oswin-ledger-dagger', 'weapon', 'weapon', { attack: 15 }),
  gear('merchants-coat', 'armour', 'armour', { defense: 3 }),
  gear('oswin-oath-sash', 'trinket', 'trinket', undefined),
  gear('ledger-lens', 'trinket', 'trinket', undefined),
];

Object.assign(LIST_PRICES, {
  'marshals-longsword': 140,
  'marshals-kite-shield': 110,
  'halvard-oath-sash': 90,
  'marshals-mantle': 400,
  'oswin-ledger-dagger': 120,
  'merchants-coat': 100,
  'oswin-oath-sash': 90,
  'ledger-lens': 350,
});

registerItems(ECONOMY_ITEMS);
