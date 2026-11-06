import type { ItemDef } from '../../../../hud/ports';
import { registerItems } from '../../../../inventory/items';
import { R25_CANDLE_ITEM } from './r25.quest';

/** R25's candles (Ebba gives three; one burns at each hearth). Every reward is L7's catalog. */
export const WASTE_A4_ITEMS: readonly ItemDef[] = [{ id: R25_CANDLE_ITEM, nameKey: `item.${R25_CANDLE_ITEM}.name`, descKey: `item.${R25_CANDLE_ITEM}.desc`, kind: 'quest', stackMax: 3 }];

export const WASTE_A4_ITEM_STRINGS: Record<string, string> = {
  [`item.${R25_CANDLE_ITEM}.name`]: 'Ebba\'s Tallow Candle',
  [`item.${R25_CANDLE_ITEM}.desc`]: 'A stub of grey tallow wound with thread. Ebba made three, one for each family she cannot visit herself.',
};

registerItems(WASTE_A4_ITEMS);
