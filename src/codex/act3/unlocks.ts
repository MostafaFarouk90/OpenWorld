// What unlocks the Act 3 entries (K15 PR 1). Every id below is a flag, place or item another thread already writes; the live
// path is the event, and `backfill` re-derives the same set from state on `save.loaded` (a save from before the entries
// existed, or a load that missed the event, still shows what happened).
import { ACT3_BLOCKS, type Act3BlockId } from '../../enemies/level';
import { ACT3_CODEX_IDS as ID } from './entries';

/** The Greyfen opens with Act 3 (K0's `openWhen`); the region's own discover flag is set on the first step in (region.plugin). */
export const GREYFEN_GATE_FLAG = 'story.gate.a3';
export const GREYFEN_DISCOVERED_FLAG = 'place.greyfen.discovered';
/** Phase F opens the Dragonspine (`story.phase.dragonspineOpen`, K16 and the act3 jump); the region's discover flag is set on the first step in. */
export const DRAGONSPINE_OPEN_FLAG = 'story.phase.dragonspineOpen';
export const DRAGONSPINE_DISCOVERED_FLAG = 'place.dragonspine.discovered';
/** The summit area (src/region/areas.ts); entering it unlocks the how-to. */
export const SUMMIT_AREA = 'dragonspine-summit';
/** K12 writes it when M24 (the dive) is done; K7 reads it for the ferry. */
export const DIVE_DONE_FLAG = 'story.m24.complete';
export const FEN_BOOTS_ITEM = 'gear.fen-boots';
export const FERRY_TOKEN_ITEM = 'key.ferry-token';
export const SHARD_GEM_PREFIX = 'shard-gem.';

/** K9's mirror of a block's lock (`warmth.block.<id>.level`, numeric). */
export const blockLevelFlagOf = (block: string): string => `warmth.block.${block}.level`;

/**
 * Entries that need two flags together: the phase flag is a release hold that could be set for every save, so it counts only
 * once the act itself has opened.
 */
export const ACT3_ALL_FLAG_UNLOCKS: readonly { all: readonly string[]; entry: string }[] = [
  { all: [GREYFEN_GATE_FLAG, DRAGONSPINE_OPEN_FLAG], entry: ID.dragonspine },
];

/** A flag that is set (truthy, or a number above zero) unlocks the entry. */
export const ACT3_FLAG_UNLOCKS: readonly { flag: string; entry: string }[] = [
  { flag: GREYFEN_GATE_FLAG, entry: ID.greyfen },
  { flag: GREYFEN_DISCOVERED_FLAG, entry: ID.greyfen },
  { flag: 'waystone.reedgate.lit', entry: ID.reedgate },
  { flag: 'waystone.greywatch.lit', entry: ID.greywatch },
  { flag: 'waystone.mireweather-hut.lit', entry: ID.mireweather },
  { flag: 'waystone.hathrens-mere.lit', entry: ID.mere },
  { flag: DIVE_DONE_FLAG, entry: ID.diving },
  { flag: DRAGONSPINE_DISCOVERED_FLAG, entry: ID.dragonspine },
  { flag: 'waystone.wyrmwatch-lodge.lit', entry: ID.wyrmwatchLodge },
  { flag: 'waystone.rime-pass.lit', entry: ID.rimePass },
  { flag: 'waystone.last-anvil.lit', entry: ID.lastAnvil },
  { flag: 'waystone.frostfang-aerie.lit', entry: ID.frostfangAerie },
  // The block levels are explained from the gate on: the map warns before the lock.
  { flag: GREYFEN_GATE_FLAG, entry: ID.blockLevels },
  ...(Object.keys(ACT3_BLOCKS) as Act3BlockId[]).map((b) => ({ flag: blockLevelFlagOf(b), entry: ID.blockLevels })),
];

/** `discover { placeId }`: the region's own id, and a waystone's `waystone.<id>`. */
export const ACT3_DISCOVER_UNLOCKS: Readonly<Record<string, string>> = {
  greyfen: ID.greyfen,
  'waystone.reedgate': ID.reedgate,
  'waystone.greywatch': ID.greywatch,
  'waystone.mireweather-hut': ID.mireweather,
  'waystone.hathrens-mere': ID.mere,
  dragonspine: ID.dragonspine,
  'waystone.wyrmwatch-lodge': ID.wyrmwatchLodge,
  'waystone.rime-pass': ID.rimePass,
  'waystone.last-anvil': ID.lastAnvil,
  'waystone.frostfang-aerie': ID.frostfangAerie,
};

/** Items held (count above zero) that unlock an entry on load: the boots mean the wading, the token the ferry. */
export const ACT3_ITEM_UNLOCKS: readonly { item: string; entry: string }[] = [
  { item: FEN_BOOTS_ITEM, entry: ID.wading },
  { item: FERRY_TOKEN_ITEM, entry: ID.ferry },
];

export interface BackfillPorts {
  /** True for a set bool flag or a number above zero. */
  flagSet(key: string): boolean;
  /** Item ids held, with counts; undefined while the inventory is missing. */
  items(): readonly { id: string; count: number }[] | undefined;
}

/** Every entry the current state says should be unlocked. Pure, so it is tested without a game. */
export function act3Backfill(p: BackfillPorts): string[] {
  const out = new Set<string>();
  for (const u of ACT3_FLAG_UNLOCKS) if (p.flagSet(u.flag)) out.add(u.entry);
  for (const u of ACT3_ALL_FLAG_UNLOCKS) if (u.all.every((f) => p.flagSet(f))) out.add(u.entry);
  const items = p.items() ?? [];
  const held = (id: string): boolean => items.some((i) => i.id === id && i.count > 0);
  for (const u of ACT3_ITEM_UNLOCKS) if (held(u.item)) out.add(u.entry);
  if (items.some((i) => i.id.startsWith(SHARD_GEM_PREFIX) && i.count > 0)) out.add(ID.shardGems);
  return [...out];
}

/** The flag keys whose change can add an entry (the plugin re-derives only for these). */
export const ACT3_WATCHED_FLAGS: ReadonlySet<string> = new Set([...ACT3_FLAG_UNLOCKS.map((u) => u.flag), ...ACT3_ALL_FLAG_UNLOCKS.flatMap((u) => u.all)]);
