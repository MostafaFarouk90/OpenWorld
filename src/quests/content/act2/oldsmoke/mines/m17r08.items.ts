import type { ItemDef } from '../../../../../hud/ports';
import { registerItems } from '../../../../../inventory/items';

const def = (id: string, kind: ItemDef['kind'], rest: Partial<Pick<ItemDef, 'slot' | 'stackMax' | 'stats'>> = {}): ItemDef =>
  ({ id, nameKey: `item.${id}.name`, descKey: `item.${id}.desc`, kind, stackMax: 1, ...rest });

/** Reward gear of M17 and R08. There is no head slot, so the helm takes the armour slot (a taste call, logged). */
export const M17R08_ITEMS: readonly ItemDef[] = [
  def('miners-helm', 'armour', { slot: 'armour', stats: { defense: 2 } }),
  def('picketts-lantern', 'trinket', { slot: 'trinket', stats: { defense: 2 } }),
];

export const M17R08_ITEM_STRINGS: Record<string, string> = {
  'item.miners-helm.name': "Miner's Helm",
  'item.miners-helm.desc': 'A dented pit helm with a lamp-hook. Slagg\'s crew gave it to whoever brought the lift back.',
  'item.picketts-lantern.name': "Pickett's Lantern",
  'item.picketts-lantern.desc': 'A cracked safety lamp with a child\'s blue ribbon on the handle. It burns warm and steadies whoever carries it.',
};

registerItems(M17R08_ITEMS);
