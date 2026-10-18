// Gold sources as readings (plans/slice-2-economy.md section 1). Every amount is a table lookup; nothing is random.
import { LEDGE_CACHE_GOLD, M06_BRIBE_GOLD, R03_COIN_GOLD } from '../quests/content/gold';
import { respecGold } from '../progression/tuning';

/** A Charred Footman killed by the player at one of the Dead Road camps. */
export const PURSE_KIND = 'blighted-soldier';
export const PURSE_GOLD = 4;
/** Spawner ids (the default spawn tag) that pay a purse. The ford pairs are a Spare lesson; patrols spawn wraiths. */
export const PURSE_SPAWNERS: readonly string[] = ['deadroad.camp-1', 'deadroad.camp-2'];
export const CAMP_FOOTMEN = 6;

/** R03's Guildhall thugs (thread 5 defines the kind, thread 17 the `r03.guildhall` anchors). */
export const THUG_KIND = 'guildhall-thug';
export const THUG_GOLD = 10;
export const THUG_SPAWNERS: readonly string[] = ['r03.guildhall'];
export const THUG_COUNT = 3;

/** Chests the economy places; gold is paid on `loot.granted` for these ids. The ledge cache is a quest effect, not here. */
export const CHEST_GOLD: Readonly<Record<string, number>> = {
  'chest:deadroad-camp-1': 15,
  'chest:deadroad-camp-2': 15,
  'chest:harrowmark-1': 70,
  'chest:harrowmark-2': 80,
  'chest:harrowmark-3': 90,
  'chest:harrowmark-4': 100,
};

export const PAID_RESPEC_LEVEL = 10;

/** Estimated sinks outside the bribe (section 1): death pouch, one escaped cutpurse, inn nights, shopping. */
export const SINKS = {
  take: { pouch: 10, cutpurse: 40, inn: 30, shopping: 60 },
  forgive: { pouch: 10, cutpurse: 40, inn: 16, shopping: 60 },
} as const;

const sum = (xs: Iterable<number>): number => [...xs].reduce((a, b) => a + b, 0);

export function incomeToM06(): number {
  const camps = CHEST_GOLD['chest:deadroad-camp-1'] + CHEST_GOLD['chest:deadroad-camp-2'];
  return CAMP_FOOTMEN * PURSE_GOLD + camps + LEDGE_CACHE_GOLD;
}

export function harrowmarkIncome(route: 'take' | 'forgive'): number {
  const chests = sum(Object.entries(CHEST_GOLD).filter(([id]) => id.startsWith('chest:harrowmark')).map(([, g]) => g));
  return THUG_COUNT * THUG_GOLD + chests + (route === 'take' ? R03_COIN_GOLD : 0);
}

/** Gold left after every estimated sink, with the bribe route, at the end of Act 1. */
export function netAtActEnd(route: 'take' | 'forgive'): number {
  const s = SINKS[route];
  return incomeToM06() + harrowmarkIncome(route) - M06_BRIBE_GOLD - s.pouch - s.cutpurse - s.inn - s.shopping;
}

export const PAID_RESPEC_COST = respecGold(PAID_RESPEC_LEVEL);
