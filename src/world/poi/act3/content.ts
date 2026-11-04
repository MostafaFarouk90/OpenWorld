// Act 3 POI content (thread K2): flags, rewards, loot, gold, the six Dragonspine rubbings and the strings. Keys are stable:
// K9's codex lock and K15's map and codex read them (plan act3-K2.md section 4).
import type { ItemStack } from '../../../core/events';
import type { Effect } from '../../../quests/types';
import { ACT3_POI_PLACED, type PlacedA3 } from './place';
import type { A3Template } from './types';

export const a3DiscoveredFlag = (id: string): string => `place.poi.a3.${id}.discovered`;
export const a3TakenFlag = (id: string): string => `poi.a3.${id}.taken`;
export const a3LoreCodexId = (id: string): string => `lore.poi.${id}`;

/** K2's six rubbings (K9's `anvilRubbings` service; flags `world.rubbing.<id>.taken`, codex `lore.rubbing.<id>`). */
export const A3_RUBBING_IDS = ['spine-1', 'spine-2', 'spine-3', 'spine-4', 'spine-5', 'spine-6'] as const;
export type A3RubbingId = (typeof A3_RUBBING_IDS)[number];
/** As K9's carvings: a 3 s hold. */
export const A3_RUBBING_HOLD_SECONDS = 3;

/** Which site carries each rubbing (from the placements). */
export function rubbingSites(placed: readonly PlacedA3[] = ACT3_POI_PLACED): Array<{ rubbing: A3RubbingId; site: PlacedA3 }> {
  const out: Array<{ rubbing: A3RubbingId; site: PlacedA3 }> = [];
  for (const p of placed) {
    const r = p.piece.interactables.find((i) => i.kind === 'rubbing');
    if (r) out.push({ rubbing: r.id.slice('use:poi-a3-rubbing-'.length) as A3RubbingId, site: p });
  }
  return out;
}

export const ACT3_POI_GOLD_CAP = 700;
export const LEAP_CACHE_XP = 120;
export const LEAP_CACHE_GOLD = 40;
export const SONG_STONE_XP = 150;
export const CHEST_GOLD = 30;

const GREYFEN_LOOT: ItemStack[] = [{ itemId: 'healing-flask', count: 2 }, { itemId: 'ember-coal', count: 2 }];
const SPINE_LOOT: ItemStack[] = [{ itemId: 'healing-flask', count: 1 }, { itemId: 'ember-coal', count: 2 }, { itemId: 'hawk-jerky', count: 1 }];

/** Chest loot (items only; gold is paid from ACT3_POI_GOLD on `loot.granted`). */
export function a3LootFor(p: PlacedA3): ItemStack[] {
  return (p.region === 'greyfen' ? GREYFEN_LOOT : SPINE_LOOT).map((s) => ({ ...s }));
}

/** Gold per source id (`chest:poi-a3-<id>`, `use:poi-a3-<id>-ledge`). */
export function buildA3Gold(placed: readonly PlacedA3[] = ACT3_POI_PLACED): Record<string, number> {
  const gold: Record<string, number> = {};
  for (const p of placed) {
    for (const it of p.piece.interactables) {
      if (it.kind === 'chest') gold[it.id] = CHEST_GOLD;
      if (it.kind === 'use' && it.prop === 'cache') gold[it.id] = LEAP_CACHE_GOLD;
    }
  }
  return gold;
}
export const ACT3_POI_GOLD: Readonly<Record<string, number>> = buildA3Gold();

export interface A3Reward {
  interactableId: string;
  onceFlag: string;
  effects: Effect[];
  codexId?: string;
}

/** Leap caches and the song stone: once-flagged XP (+ gold) through installPoiRewards. */
export function buildA3Rewards(placed: readonly PlacedA3[] = ACT3_POI_PLACED): A3Reward[] {
  const out: A3Reward[] = [];
  for (const p of placed) {
    for (const it of p.piece.interactables) {
      if (it.kind !== 'use') continue;
      if (it.prop === 'cache') {
        out.push({ interactableId: it.id, onceFlag: a3TakenFlag(p.id), effects: [{ xp: LEAP_CACHE_XP }, { giveGold: LEAP_CACHE_GOLD } as Effect] });
      } else if (p.template === 'song-stone') {
        out.push({ interactableId: it.id, onceFlag: a3TakenFlag(p.id), effects: [{ xp: SONG_STONE_XP }], codexId: a3LoreCodexId(p.id) });
      }
    }
  }
  return out;
}

export const A3_POI_NAMES: Record<A3Template, string> = {
  'drowned-church': 'a drowned church',
  'stilt-camp': 'a stilt camp',
  'peat-cutting': 'a peat cutting',
  'reed-island': 'a reed island',
  'song-stone': 'a singing stone',
  'hawk-nest': "a rime hawk's nest",
  'hunter-cairn': "a hunters' cairn",
  'frozen-camp': 'a frozen camp',
  'glass-vein': 'a forge-glass vein',
  vista: 'a lookout',
  'leap-cache': 'a hidden ledge',
};

/** The six rubbings (forge history from the keepers' side, design 7.5; spine-6 carries design 13's "cold half" hook). */
export const A3_RUBBING_TEXTS: Record<A3RubbingId, { name: string; body: string }> = {
  'spine-1': {
    name: 'Rubbing: the spark-bearer',
    body: 'A hawk with a coal in its talons flies over the peaks. The line beneath says the first spark came down to the smiths from the mountain, carried, not stolen.',
  },
  'spine-2': {
    name: "Rubbing: the hunters' tally",
    body: 'Rows of short strokes, cut by many hands. Each stroke is a keeper taken. The last rows are cut over older carvings of the keepers themselves, as if to hide them.',
  },
  'spine-3': {
    name: 'Rubbing: the cold camp',
    body: 'Figures huddle round a fire that gives no light. The carver wrote one word above them in the old tongue: "unasked". A fire not asked for does not warm.',
  },
  'spine-4': {
    name: 'Rubbing: the glass that remembers',
    body: 'The keepers breathe on black rock until it runs like water and sets like glass. The glass, the carving says, keeps the heat of every forge that ever burned.',
  },
  'spine-5': {
    name: 'Rubbing: the view of the Forge',
    body: 'From this height the carver drew the Caldera as a ring with a flame inside it, and every road in the kingdom bending toward it like spokes toward a hub.',
  },
  'spine-6': {
    name: 'Rubbing: the cold half',
    body: "Two keepers face away from each other, one wreathed in flame, one in frost. Beneath them: the Forge's duty had two halves, and the cold half went north.",
  },
};

export const A3_SONG_STONE_TEXT = {
  name: 'The singing stone',
  body: 'Wave-lines run round the stone, and between them a verse the fen folk still hum without knowing it: "Sleep under, keeper, the reeds keep watch; the water holds what the fire forgets."',
};

export const POI_A3_STRINGS_EN: Record<string, string> = {
  'poi.a3.found': 'You found {name}.',
  ...Object.fromEntries(Object.entries(A3_POI_NAMES).map(([k, v]) => [`poi.a3.name.${k}`, v])),
  'poi.a3.rubbing.prompt': 'Take a rubbing of the carving',
  'poi.a3.song.prompt': 'Read the carving',
  'codex.lore.poi-greyfen-song-stone.name': A3_SONG_STONE_TEXT.name,
  'codex.lore.poi-greyfen-song-stone.body': A3_SONG_STONE_TEXT.body,
  ...Object.fromEntries(
    Object.entries(A3_RUBBING_TEXTS).flatMap(([id, t]) => [
      [`codex.lore.rubbing-${id}.name`, t.name],
      [`codex.lore.rubbing-${id}.body`, t.body],
    ]),
  ),
};
