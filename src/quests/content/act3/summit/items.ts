import type { ItemDef } from '../../../../hud/ports';
import { registerItems } from '../../../../inventory/items';
import '../../../../gear/tier4/catalog';
import '../../../../economy/items.act3';

/** New items of the summit quests (taste calls logged in design/changes-applied.md). K10's own ids (`cliff-crampons`, `skarls-crossbow`) are not redefined here. */
export const SUMMIT_ITEMS: readonly ItemDef[] = [
  { id: 'ysmeryths-ember-scale', nameKey: 'item.ysmeryths-ember-scale.name', descKey: 'item.ysmeryths-ember-scale.desc', kind: 'trinket', stackMax: 1, slot: 'trinket' },
];

export const SUMMIT_ITEM_STRINGS: Record<string, string> = {
  'item.ysmeryths-ember-scale.name': 'Scale of the Banked Coal',
  'item.ysmeryths-ember-scale.desc': 'A hand-sized scale the Coal-Mother let fall at the roost, warm in any weather. It has the glow of a banked coal at its heart. A keepsake; it does nothing else.',
};

registerItems(SUMMIT_ITEMS);
