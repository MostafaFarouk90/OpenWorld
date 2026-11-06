// What unlocks the Act 4 entries (L9). Every id is a flag, a quest, a place or an item another thread already writes; the live
// path is the event, and `act4Backfill` re-derives the same set from state on `save.loaded`.
import { ACT4_CODEX_IDS as ID } from './entries';
import { ASH_MASK } from '../../weather/tuning';

/** A set flag (truthy, or a number above zero) unlocks the entry. */
export const ACT4_FLAG_UNLOCKS: readonly { flag: string; entry: string }[] = [
  { flag: 'boss.bellows-engine.outcome', entry: ID.bellowsEngine },
  { flag: 'boss.eormen.outcome', entry: ID.eormen },
  { flag: 'place.ashen-waste.discovered', entry: ID.waste },
  { flag: 'waystone.ashgate.lit', entry: ID.ashgate },
  // L1 PR 2's site waystones. The cathedral and Rimfoot have no discover place: their quests (D08, M46) unlock them.
  { flag: 'waystone.walker-camp.lit', entry: ID.walkerCamp },
  { flag: 'waystone.cinder-chapel.lit', entry: ID.cinderChapel },
  { flag: 'waystone.glasslands.lit', entry: ID.glasslands },
  { flag: 'shrine.singing-slag.lit', entry: ID.glasslands },
  { flag: 'shrine.singing-slag.lit', entry: ID.chime },
  { flag: 'story.m38.complete', entry: ID.vey },
  { flag: 'story.m39.complete', entry: ID.gaut },
  { flag: 'story.m43.complete', entry: ID.ashwalkers },
  // L11: the end of scene-a4-dream-1 (Q10).
  { flag: 'story.m44.dreamSeen', entry: ID.dream },
  { flag: ASH_MASK.flag, entry: ID.mask },
];

/** A quest accepted (active, completed or failed) unlocks the entry. */
export const ACT4_QUEST_UNLOCKS: readonly { quest: string; entry: string }[] = [
  { quest: 'm35', entry: ID.escorts },
  { quest: 'm38', entry: ID.councilChamber },
  { quest: 'd07', entry: ID.crucible },
  { quest: 'm42', entry: ID.wulfhild },
  { quest: 'm42', entry: ID.hild },
  { quest: 'm42', entry: ID.storms },
  { quest: 'm42', entry: ID.waste },
  { quest: 'm44', entry: ID.ebba },
  { quest: 'm45', entry: ID.chime },
  { quest: 'd08', entry: ID.huskCathedral },
  { quest: 'm46', entry: ID.rimfoot },
];

/** `discover { placeId }`: the region's id, or a waystone's `waystone.<id>`. */
export const ACT4_DISCOVER_UNLOCKS: Readonly<Record<string, string>> = {
  'ashen-waste': ID.waste,
  'waystone.ashgate': ID.ashgate,
  'waystone.walker-camp': ID.walkerCamp,
  'waystone.cinder-chapel': ID.cinderChapel,
  'waystone.glasslands': ID.glasslands,
};

/** NPCs whose first talk unlocks their entry (`dialogue.started { npcId }`). */
export const ACT4_TALK_UNLOCKS: Readonly<Record<string, string>> = {
  wulfhild: ID.wulfhild,
  hild: ID.hild,
  ebba: ID.ebba,
};

export const ACT4_ITEM_UNLOCKS: readonly { item: string; entry: string }[] = [{ item: ASH_MASK.itemId, entry: ID.mask }];

export interface Act4BackfillPorts {
  flagSet(key: string): boolean;
  questState(id: string): string | undefined;
  items(): readonly { id: string; count: number }[] | undefined;
}

/** Every Act 4 entry the current state says should be unlocked. Pure. */
export function act4Backfill(p: Act4BackfillPorts): string[] {
  const out = new Set<string>();
  for (const u of ACT4_FLAG_UNLOCKS) if (p.flagSet(u.flag)) out.add(u.entry);
  for (const u of ACT4_QUEST_UNLOCKS) {
    const s = p.questState(u.quest);
    if (s === 'active' || s === 'completed' || s === 'failed') out.add(u.entry);
  }
  const items = p.items() ?? [];
  for (const u of ACT4_ITEM_UNLOCKS) if (items.some((i) => i.id === u.item && i.count > 0)) out.add(u.entry);
  return [...out];
}

export const ACT4_WATCHED_FLAGS: ReadonlySet<string> = new Set(ACT4_FLAG_UNLOCKS.map((u) => u.flag));
