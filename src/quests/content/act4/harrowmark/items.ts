import type { ItemDef } from '../../../../hud/ports';
import { registerItems } from '../../../../inventory/items';

const def = (id: string): ItemDef => ({ id, nameKey: `item.${id}.name`, descKey: `item.${id}.desc`, kind: 'quest', stackMax: 1 });

/** R22's three materials (quest items, taken back at the forge). Every other reward is L7's catalog. */
export const HARROWMARK_A4_ITEMS: readonly ItemDef[] = [def('r22-star-iron'), def('r22-bog-oak'), def('r22-rime-iron')];

export const HARROWMARK_A4_ITEM_STRINGS: Record<string, string> = {
  'item.r22-star-iron.name': 'Star-Iron',
  'item.r22-star-iron.desc': 'A fist of black iron from a Cinderreach crag where a star fell, they say. It is warm on the side that faced the sky.',
  'item.r22-bog-oak.name': 'Bog-Oak Billet',
  'item.r22-bog-oak.desc': 'Oak that lay a thousand years in Greyfen peat, black as coal and hard as horn. It will take a grip and never split.',
  'item.r22-rime-iron.name': 'Rime-Iron',
  'item.r22-rime-iron.desc': 'Frost-blue ore from a Dragonspine cairn. Smiths say it holds an edge because it remembers the cold.',
};

registerItems(HARROWMARK_A4_ITEMS);
