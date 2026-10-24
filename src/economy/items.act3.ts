// Act 3 items the vendors and Gytha's brewing need and the gear catalog does not define (materials, trinkets and keys live in
// src/gear/tier4/catalog.ts). Registered at module scope so ids exist before a save loads.
import type { ItemDef } from '../hud/ports';
import { registerItems } from '../inventory/items';

const item = (id: string, kind: ItemDef['kind'], stackMax: number, use?: ItemDef['use']): ItemDef => ({
  id,
  nameKey: `item.${id}.name`,
  descKey: `item.${id}.desc`,
  kind,
  stackMax,
  ...(use ? { use } : {}),
});

export const FEN_SALVE = { item: 'fen-salve', recipe: 'fen-salve-recipe', burnRelief: 20, goldCost: 15, herbs: ['bog-myrtle', 'sundew', 'mire-lily'] } as const;

export const ACT3_ITEMS: readonly ItemDef[] = [
  item('master-bolts', 'quest', 40),
  item('fishing-bait', 'quest', 20),
  item('fishing-tackle', 'quest', 1),
  item('reed-basket', 'quest', 10),
  item('bog-myrtle', 'quest', 10),
  item('sundew', 'quest', 10),
  item('mire-lily', 'quest', 10),
  item(FEN_SALVE.item, 'consumable', 5, { noHeal: true, burnRelief: FEN_SALVE.burnRelief }),
  item(FEN_SALVE.recipe, 'quest', 1),
  item('rope', 'quest', 5),
  item('hawk-jerky', 'quest', 10),
  item('monastery-candle', 'quest', 10),
];

registerItems(ACT3_ITEMS);
