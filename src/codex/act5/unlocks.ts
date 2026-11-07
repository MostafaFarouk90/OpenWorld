// What unlocks the Act 5 entries (N9). Every id is a flag, a quest, a place or an item another thread already writes; the live
// path is the event, and `act5Backfill` re-derives the same set from state on `save.loaded`.
import { ACT5_CODEX_IDS as ID } from './entries';

export const ACT5_FLAG_UNLOCKS: readonly { flag: string; entry: string }[] = [
  { flag: 'boss.vey.outcome', entry: ID.vey },
  { flag: 'boss.ulthred.outcome', entry: ID.ulthred },
  { flag: 'story.gate.a5', entry: ID.caldera },
  { flag: 'story.m47.rimGateOpen', entry: ID.rimGate },
  { flag: 'waystone.rim-camp.lit', entry: ID.rimCamp },
  { flag: 'story.m49.complete', entry: ID.rimCamp },
  { flag: 'story.m48.complete', entry: ID.lavaStair },
  { flag: 'story.m50.complete', entry: ID.coolingHall },
  { flag: 'story.m51.complete', entry: ID.wyrmTerraces },
  { flag: 'story.m53.complete', entry: ID.foundry },
  { flag: 'shrine.anvil-of-ages.lit', entry: ID.anvilOfAges },
  { flag: 'story.m47.started', entry: ID.alric },
  { flag: 'story.m49.started', entry: ID.edric },
  { flag: 'story.m49.complete', entry: ID.rook },
];

/** A quest accepted (active, completed or failed) unlocks the entry. */
export const ACT5_QUEST_UNLOCKS: readonly { quest: string; entry: string }[] = [
  { quest: 'm47', entry: ID.alric },
  { quest: 'm48', entry: ID.lava },
  { quest: 'm48', entry: ID.lavaStair },
  { quest: 'm52', entry: ID.siege },
  { quest: 'm54', entry: ID.ulthredPerson },
  { quest: 'm54', entry: ID.firstKing },
  { quest: 'm54', entry: ID.foundry },
  { quest: 'd10', entry: ID.hammerHall },
  { quest: 'd10', entry: ID.heartshard },
  { quest: 'm56', entry: ID.anvilOfAges },
];

/** Sunforged and forge-heart items (N7: src/gear/tier5/catalog.ts `SUNFORGED_IDS`, src/items/act5/ids.ts). Read by name. */
export const ACT5_ITEM_UNLOCKS: readonly { item: string; entry: string }[] = [
  { item: 'forge-heart-fragment', entry: ID.sunforged },
  ...[
    'sunforged-dawnbrand', 'sunforged-aegis', 'sunplate', 'sunforged-worldsplitter', 'sun-tanned-warplate', 'sunforged-scepter',
    'sunweave-robe', 'sunforged-sparks', 'cinderwraith-coat', 'sunforged-longbolt', 'rimwalkers-cloak',
  ].map((item) => ({ item, entry: ID.sunforged })),
];

export const ACT5_TALK_UNLOCKS: Readonly<Record<string, string>> = {
  alric: ID.alric,
  edric: ID.edric,
  rook: ID.rook,
};

export interface Act5BackfillPorts {
  flagSet(key: string): boolean;
  questState(id: string): string | undefined;
  items(): readonly { id: string; count: number }[] | undefined;
}

export function act5Backfill(p: Act5BackfillPorts): string[] {
  const out = new Set<string>();
  for (const u of ACT5_FLAG_UNLOCKS) if (p.flagSet(u.flag)) out.add(u.entry);
  for (const u of ACT5_QUEST_UNLOCKS) {
    const s = p.questState(u.quest);
    if (s === 'active' || s === 'completed' || s === 'failed') out.add(u.entry);
  }
  const items = p.items() ?? [];
  for (const u of ACT5_ITEM_UNLOCKS) if (items.some((i) => i.id === u.item && i.count > 0)) out.add(u.entry);
  return [...out];
}

export const ACT5_WATCHED_FLAGS: ReadonlySet<string> = new Set(ACT5_FLAG_UNLOCKS.map((u) => u.flag));
