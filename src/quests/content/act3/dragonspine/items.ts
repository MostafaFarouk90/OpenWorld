import type { ItemDef } from '../../../../hud/ports';
import { registerItems } from '../../../../inventory/items';
import '../../../../gear/tier4/catalog';
import '../../../../economy/items.act3';

const def = (id: string, kind: ItemDef['kind'], stackMax: number, rest: Partial<Pick<ItemDef, 'slot' | 'stats'>> = {}): ItemDef =>
  ({ id, nameKey: `item.${id}.name`, descKey: `item.${id}.desc`, kind, stackMax, ...rest });

/** New items of the lower Dragonspine quests (taste calls logged in design/changes-applied.md). K10's own ids are not redefined here. */
export const DRAGONSPINE_ITEMS: readonly ItemDef[] = [
  def('frostbrows-axe', 'quest', 1),
  def('forge-candle-bundle', 'quest', 1),
  def('rime-hawk-egg', 'quest', 1),
  def('hawk-feather-charm', 'trinket', 1, { slot: 'trinket' }),
  def('ansgars-blessing', 'trinket', 1, { slot: 'trinket' }),
];

export const DRAGONSPINE_ITEM_STRINGS: Record<string, string> = {
  'item.frostbrows-axe.name': "Frostbrow's Axe",
  'item.frostbrows-axe.desc': "Eadgyth's old dragon-axe, hafted in black ash, its edge still bright under forty years of cave dust. She swore never to touch it again.",
  'item.forge-candle-bundle.name': 'Forge-Candle Bundle',
  'item.forge-candle-bundle.desc': 'Six tallow candles, each lit from the Last Anvil and tied in a wrap of rime-grass. They burn only for whoever carries them.',
  'item.rime-hawk-egg.name': 'Rime Hawk Egg',
  'item.rime-hawk-egg.desc': 'A pale blue egg, speckled grey and cold as a river stone. It is warm only at the middle. Carry it up the cliff and do not drop it.',
  'item.hawk-feather-charm.name': 'Hawk-Feather Charm',
  'item.hawk-feather-charm.desc': 'A grey primary feather bound to a leather loop, from the nest the knight returned to. The hunters say the hawks remember a kindness. A keepsake; it does nothing else.',
  'item.ansgars-blessing.name': "Ansgar's Blessing",
  'item.ansgars-blessing.desc': 'A tallow stub from the Last Anvil, blessed with a thumb of soot. Brother Ansgar says the road remembers who lit it. A keepsake; it does nothing else.',
};

registerItems(DRAGONSPINE_ITEMS);
