// Which NPCs wear a generated townsfolk body (GLB-Viewer character generator) instead of a KayKit adventurer. Ordinary
// people only: the named story cast, companions, stewards and ghosts keep KayKit (KEEP_KAYKIT, pinned by a test). A taste
// call approved 2026-10-30 (design/changes-applied.md); emptying TOWNSFOLK_BODIES reverts every NPC to its KayKit body.
import { NPC_TUNING } from './tuning';
import type { NpcDef, TownBodyId } from './types';

/** Top of each body in KayKit units, measured from the files (Item and Offhand left out). Pinned by a test. */
export const TOWN_BODY_HEIGHT: Record<TownBodyId, number> = {
  'town-villager-a': 2.164,
  'town-villager-b': 2.214,
  'town-villager-c': 2.164,
  'town-farmer-a': 2.163,
  'town-farmer-b': 2.195,
  'town-merchant-a': 2.203,
  'town-merchant-b': 2.147,
  'town-blacksmith-a': 2.18,
  'town-guard-a': 2.29,
  'town-priest-a': 2.25,
  'town-miner-a': 2.23,
  'town-miner-b': 2.251,
  'town-survivor-a': 2.232,
};

/** Every body stands this tall (m) at def scale 1, whatever its file height. */
export const TOWN_BODY_STANDING_HEIGHT = 1.76;

/** How far a mapped NPC's own tint pulls the palette (the KayKit bodies use NPC_TUNING.tintStrength). */
export const TOWN_TINT_STRENGTH = 0.25;

/**
 * Def id -> generated body. Def ids, not names: `townsfolk.*` are the Kettlewick tutorial figures, `carry:<item id>` the carried
 * bodies (a carried miner wears the body the delivered NPC stands in).
 */
export const TOWNSFOLK_BODIES: Readonly<Record<string, TownBodyId>> = {
  // Brightwater
  'carter-1': 'town-farmer-a',
  'carter-2': 'town-villager-b',
  'carter-3': 'town-farmer-b',
  'townsfolk.baker-queue-1': 'town-villager-a',
  'townsfolk.baker-queue-2': 'town-farmer-a',
  'townsfolk.tavern-loiterer': 'town-villager-b',
  'townsfolk.south-chat-1': 'town-villager-c',
  'townsfolk.south-chat-2': 'town-merchant-a',
  'townsfolk.north-chat-1': 'town-farmer-b',
  'townsfolk.north-chat-2': 'town-villager-a',
  'townsfolk.bakery-side': 'town-villager-c',
  'carry:villager-1': 'town-villager-a',
  'carry:villager-2': 'town-villager-c',
  'carry:villager-3': 'town-farmer-b',
  // Harrowmark
  'refugee-1': 'town-survivor-a',
  'refugee-2': 'town-villager-c',
  'stallholder-1': 'town-merchant-a',
  'stallholder-2': 'town-merchant-b',
  'guild-doorman': 'town-guard-a',
  'keep-guard': 'town-guard-a',
  sexton: 'town-priest-a',
  armourer: 'town-blacksmith-a',
  clerk: 'town-merchant-b',
  // Cinderreach
  'household-1': 'town-villager-a',
  'household-2': 'town-villager-b',
  'household-3': 'town-survivor-a',
  'household-4': 'town-villager-c',
  'carter-bound': 'town-farmer-a',
  'carry:m12-wounded-1': 'town-survivor-a',
  'carry:m12-wounded-2': 'town-villager-b',
  'lantern-keeper': 'town-priest-a',
  // Oldsmoke and the mines
  'miner-1': 'town-miner-a',
  'miner-2': 'town-miner-b',
  'miner-3': 'town-miner-a',
  'miner-4': 'town-miner-b',
  'miner-guard-1': 'town-miner-b',
  'miner-guard-2': 'town-miner-a',
  'winch-wright': 'town-blacksmith-a',
  'miner-hale': 'town-miner-a',
  'miner-brig': 'town-miner-b',
  // carried to the lift, then standing as miner-hale and miner-brig (story.m17.miner<n>.delivered)
  'carry:m17-miner-1': 'town-miner-a',
  'carry:m17-miner-2': 'town-miner-b',
  // Greyfen
  'ferry-hand-1': 'town-villager-b',
  'ferry-hand-2': 'town-villager-c',
  'reed-cutter-1': 'town-farmer-a',
  'reed-cutter-2': 'town-farmer-b',
  'herb-cutter': 'town-villager-a',
};

/** Def ids that must keep their KayKit body (story cast, companions, lords, stewards, ghosts). Pinned by a test. */
export const KEEP_KAYKIT: readonly string[] = [
  // Brightwater and companions
  'gaut', 'edda', 'stane', 'aelfreda', 'hob', 'wynn', 'tobb', 'hrolf', 'halvard-rider', 'aldwin', 'garrick',
  // Harrowmark
  'rook', 'aldith', 'gerta', 'whitlock', 'pennard', 'ashdown', 'dunstan', 'wace', 'wystan', 'merrin', 'edric', 'vey',
  'pellam', 'fence', 'crabbe', 'grisel', 'grisel-steward',
  // Cinderreach
  'osgar', 'ketta', 'maud', 'beornwyn', 'pell', 'osric', 'ealdred', 'wynne', 'corwin', 'brand', 'redmane',
  // Oldsmoke and the mines
  'aldous', 'wenna', 'slagg', 'pike', 'steward-gate-1', 'steward-gate-2', 'steward-market-1', 'steward-market-2',
  'steward-hall-1', 'steward-hall-2', 'steward-hall-3', 'steward-hall-4', 'steward-captain', 'wyrmling-keeper',
  'pike-apprentice', 'pickett', 'shift-crew',
  // Greyfen
  'leofa', 'dudda', 'hild', 'widow', 'gytha', 'causeway-ranger', 'greywatch-ranger-1', 'greywatch-ranger-2',
  'greywatch-ranger-3', 'deserter', 'bell-keeper',
  // Dragonspine (all of it for now: the generator has no frost palette yet, and the hunters wear the hunter look)
  'thorgar', 'eadgyth', 'ansgar', 'lodge-hunter-cave', 'egg-thief', 'lodge-hunter-1', 'lodge-hunter-2', 'lodge-hunter-3',
  'lodge-hunter-4', 'lodge-hunter-5', 'lodge-hunter-6', 'sled-hand-1', 'sled-hand-2', 'pilgrim-1', 'pilgrim-2', 'pilgrim-3',
];

/** Def scale that brings `body` to TOWN_BODY_STANDING_HEIGHT (times `scale`) at the NPCs' KayKit base scale. */
export function townBodyScale(body: TownBodyId, scale = 1): number {
  return (scale * TOWN_BODY_STANDING_HEIGHT) / (NPC_TUNING.modelBaseScale * TOWN_BODY_HEIGHT[body]);
}

/**
 * The def with its generated body when TOWNSFOLK_BODIES maps its id, else the def itself. The KayKit def stays as
 * `fallback` for a body that fails to load. Defs with extras or decorate hooks are never swapped (those hooks are written
 * for KayKit node names).
 */
export function withTownsfolkBody(def: NpcDef): NpcDef {
  const body = TOWNSFOLK_BODIES[def.id];
  if (!body || def.model === body || def.extras || def.decorate) return def;
  return { ...def, model: body, scale: townBodyScale(body, def.scale), tintStrength: TOWN_TINT_STRENGTH, fallback: def };
}
