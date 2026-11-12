// G3 New Game+ ("Second Hearth", design 12.5): numbers and lists. Plan: plans/g3-new-game-plus.md (project files).

/** The save entry this feature owns: `{ cycle, endingsSeen }`. */
export const NGPLUS_KEY = 'ngplus';
export const NGPLUS_VERSION = 1;

/**
 * Entries a Second Hearth keeps (design 12.5 "Carries over"); every other entry is dropped, so its owner loads fresh-game
 * defaults ("Resets": quests, flags, favour, waystones, shrines and W, map, companions, mount, vendors).
 * `cinderlands` is G4's (Embers, Heat, Mastery, bests): kept whole.
 */
export const CARRIED_KEYS: readonly string[] = ['progression', 'inventory', 'gear', 'classes', 'codex', 'prompts', 'cinderlands', NGPLUS_KEY];

/** Quest-kind items that are really ammunition, kept with the gear. */
export const KEPT_QUEST_ITEMS: ReadonlySet<string> = new Set(['crossbow-bolts', 'marsh-bow-bolts']);

/** Enemy level in a Second Hearth (design 12.5: the player's cap). */
export const NGPLUS_ENEMY_LEVEL = 40;

/** Design 12.5: +1 tempering per cycle ("+1 tempering available"); at most this many levels over the base cap. */
export const TEMPER_BONUS_MAX = 2;

/**
 * Design 12.5 (Heat 5 list): from cycle 2 enemies are Burning. G4's Cinderlands Burning (35% of hits ignite, 4 per second
 * for 3 s) made deterministic: every third hostile melee hit on the player ignites, the first one included (taste call G3-5).
 */
/** From cycle 2, every third hostile melee hit applies G4's Burning (BURNING_STATUS, src/cinderlands/heat.ts). */
export const NGPLUS_BURNING = { fromCycle: 2, everyNthHit: 3 } as const;

/**
 * The `tutorial` entry a Second Hearth starts with: not begun, so the tutorial's start runs, and G3's row there takes
 * "Skip to Kettlewick" without the kit reset. (Without any entry the director would migrate to T01.)
 */
export const TUTORIAL_NOT_BEGUN = {
  version: 1,
  data: { beat: null, complete: false, finished: [], skipped: [], progress: {}, mode: 'kettlewick', kitGranted: true, t13PendingPassive: null },
} as const;
