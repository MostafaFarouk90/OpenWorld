import type { ItemDef } from '../../../../hud/ports';
import { registerItems } from '../../../../inventory/items';
import '../../../../gear/tier4/catalog';
import '../../../../economy/items.act3';

const def = (id: string, kind: ItemDef['kind'], stackMax: number, rest: Partial<Pick<ItemDef, 'slot' | 'stats'>> = {}): ItemDef =>
  ({ id, nameKey: `item.${id}.name`, descKey: `item.${id}.desc`, kind, stackMax, ...rest });

/**
 * New items of the Greyfen quests (plan 8, taste calls logged in design/changes-applied.md). `hathrens-scale` is K9's id: it is
 * registered here because K9 only reads it. The Murkjaw shard-gem is K10's boss drop and is not defined here.
 */
export const GREYFEN_ITEMS: readonly ItemDef[] = [
  def('m24-ferry-horn', 'quest', 1),
  def('lullaby-reed-pipe', 'trinket', 1, { slot: 'trinket' }),
  def('marsh-bow-bolts', 'quest', 40),
  def('murkjaw-tooth', 'quest', 1),
  def('hathrens-scale', 'quest', 1),
];

export const GREYFEN_ITEM_STRINGS: Record<string, string> = {
  'item.m24-ferry-horn.name': "Dudda's Ferry Horn",
  'item.m24-ferry-horn.desc': 'A ram\'s horn bound in brass, black with pool-silt. It still sounds, low and wet, a note the whole landing used to know.',
  'item.lullaby-reed-pipe.name': 'Lullaby Reed-Pipe',
  'item.lullaby-reed-pipe.desc': 'A pipe of drowned-chapel reed, four holes and a mouth worn smooth by monks. It plays one tune, and the fen goes quiet to hear it.',
  'item.marsh-bow-bolts.name': 'Marsh Bow Bolts',
  'item.marsh-bow-bolts.desc': 'Leofa\'s bolts: reed shafts, heron-grey fletching, tips dipped in peat tar. A bundle of twenty from the Greywatch quiver.',
  'item.murkjaw-tooth.name': "Murkjaw's Tooth",
  'item.murkjaw-tooth.desc': 'A tooth as long as a short sword, yellow and ridged, still cold from the Deeps. The drowned monks kept a tally of what it took.',
  'item.hathrens-scale.name': "Hathren's Scale",
  'item.hathrens-scale.desc': 'A scale as wide as a shield, grey-green and warm, humming faintly with the tune she left. It cools the Burn the way her breath cooled the Mere.',
};

registerItems(GREYFEN_ITEMS);
