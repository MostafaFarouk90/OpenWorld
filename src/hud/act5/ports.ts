// Act 5 N9 (plans/act5-N9.md section 14): the values other Act 5 threads own, behind one port each with a documented
// default. When the owner's module exists, the default is replaced by an import in this one file.

/**
 * Rekindle takes Cael's life at this many Scars or more (plan Part 2.7, Q13). N11 PR 2 owns the rule
 * (`story.m56.caelLives`); until its export exists this is the plan's figure.
 */
export const REKINDLE_SCAR_LIMIT = 8;

/**
 * The siege ids the HUD draws: N4 confirmed `m52` and `r27` (plans/act5-N4.md section 12). An id that is not listed hides the
 * HUD: the HUD never guesses.
 */
export const DEFAULT_SIEGE_IDS: readonly string[] = ['m52', 'r27'];

/** Quest flags the siege HUD reads. */
export const M52_STARTED_FLAG = 'story.m52.started';
export const M52_COMPLETE_FLAG = 'story.m52.complete';

/**
 * The flags "The Rim holds" recap rows read (N10 writes the M52 flags; N10 does not exist yet, so these are the plan's
 * names and a missing flag drops its row). Each row: strings key, the flag that must be set.
 */
export const RIM_HOLDS_ROWS: readonly { key: string; flag: string }[] = [
  { key: 'hud.phase.rimHolds.row.gate', flag: M52_COMPLETE_FLAG },
  { key: 'hud.phase.rimHolds.row.allies', flag: 'story.m49.complete' },
  { key: 'hud.phase.rimHolds.row.dragons', flag: 'story.m51.complete' },
  { key: 'hud.phase.rimHolds.row.spared', flag: 'story.m52.sparedAny' },
  { key: 'hud.phase.rimHolds.row.household', flag: 'story.m52.wave4Held' },
];
