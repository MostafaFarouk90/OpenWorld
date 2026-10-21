// Loot and rewards for Act 2 POIs. Chest loot is items only; gold comes from ACT2_POI_GOLD (paid by the poi plugin on
// loot.granted) so the Act 1 CHEST_GOLD table stays untouched. Total across all 19 chests, caches and stones: 600 gold or less.
import type { ItemStack } from '../../core/events';

export const ACT2_POI_GOLD_CAP = 600;

/** Loot per template tier (items only). Ids are checked against the live item registry in loot.test.ts. */
export const POI_LOOT: Record<string, ItemStack[]> = {
  common: [{ itemId: 'healing-flask', count: 1 }],
  camp: [{ itemId: 'healing-flask', count: 1 }, { itemId: 'barley-cake', count: 2 }],
  cave: [{ itemId: 'ember-coal', count: 2 }],
  ruin: [{ itemId: 'healing-flask', count: 2 }],
  'wyrm-nest': [{ itemId: 'ember-coal', count: 3 }],
  'hunter-pen': [{ itemId: 'healing-flask', count: 1 }, { itemId: 'barley-cake', count: 1 }],
  foxfire: [{ itemId: 'barley-cake', count: 1 }],
  'fox-cache': [{ itemId: 'healing-flask', count: 2 }, { itemId: 'ember-coal', count: 2 }],
};

/** Gold per source id (`chest:poi-a2-<id>`, `use:poi-a2-<id>-ledge`, `chest:poi-a2-foxfire-<n>`, `chest:poi-a2-fox-cache`). */
export const ACT2_POI_GOLD: Record<string, number> = {};

export function setPoiGold(table: Record<string, number>): void {
  for (const k of Object.keys(ACT2_POI_GOLD)) delete ACT2_POI_GOLD[k];
  Object.assign(ACT2_POI_GOLD, table);
}

export function validateLoot(): string[] {
  const errs: string[] = [];
  for (const [k, stacks] of Object.entries(POI_LOOT)) {
    for (const s of stacks) {
      if (!s.itemId || !Number.isInteger(s.count) || s.count <= 0) errs.push(`loot ${k}: bad stack ${JSON.stringify(s)}`);
    }
  }
  const total = Object.values(ACT2_POI_GOLD).reduce((a, b) => a + b, 0);
  if (total > ACT2_POI_GOLD_CAP) errs.push(`gold total ${total} exceeds ${ACT2_POI_GOLD_CAP}`);
  for (const [k, g] of Object.entries(ACT2_POI_GOLD)) if (!Number.isInteger(g) || g < 0) errs.push(`gold ${k}: ${g}`);
  return errs;
}

export function lootFor(template: string): ItemStack[] {
  const l = POI_LOOT[template] ?? POI_LOOT.common;
  return l.map((s) => ({ ...s }));
}
