// v0.9 item 17: the Act 5 music slots. N8 owns the tracks; these are the keys the system threads emit and N8 builds to.
/** Boss-mix keys the Caldera's track carries in `bossMixes` (the D09 and D10 boss ids). */
export const ACT5_BOSS_MIX_KEYS: readonly string[] = ['vey', 'ulthred'];
/** Ulthred's three phases, one mix each (from `boss.phase`). */
export const ULTHRED_PHASE_MIX_KEYS: readonly string[] = ['ulthred.1', 'ulthred.2', 'ulthred.3'];
/** The siege's mix (M52 and R27, while the `siege` movement mode is pushed). */
export const SIEGE_MIX_KEY = 'siege';
/** One ending theme per M56 choice. */
export const ENDING_THEME_IDS: readonly string[] = ['ending.rekindle', 'ending.let-it-die'];
/** The credits cue; it takes R30's verse from `story.r30.verse` when that is set. */
export const CREDITS_CUE_ID = 'credits';
export const CREDITS_VERSE_FLAG = 'story.r30.verse';
