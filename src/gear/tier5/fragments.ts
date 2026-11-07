// Act 5 N7 (Q9): forge-heart fragments. Sources sum to 5; a weapon and an armour cost 2 each, Aegis 1 (the spare).
import type { ItemDef } from '../../hud/ports';
import { registerItems } from '../../inventory/items';

export const FORGE_HEART_FRAGMENT = 'forge-heart-fragment';

/** Where fragments come from (M48 and M50 and D09 pay by quest reward, the Foundry chest by loot). */
export const FRAGMENT_SOURCES = { m48: 1, m50: 1, d09: 2, foundryChest: 1 } as const;
export const FRAGMENT_TOTAL: number = Object.values(FRAGMENT_SOURCES).reduce((a, b) => a + b, 0);

/** N2 places this chest on the vat gallery floor of the Foundry Descent; its loot is one fragment. */
export const FOUNDRY_CHEST = { id: 'chest:foundry-cache', loot: [{ itemId: FORGE_HEART_FRAGMENT, count: FRAGMENT_SOURCES.foundryChest }] } as const;

registerItems([{ id: FORGE_HEART_FRAGMENT, nameKey: `item.${FORGE_HEART_FRAGMENT}.name`, descKey: `item.${FORGE_HEART_FRAGMENT}.desc`, kind: 'quest', stackMax: 9 } satisfies ItemDef]);
