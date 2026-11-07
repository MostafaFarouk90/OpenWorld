import { CREDITS_VERSE_FLAG, ENDING_THEME_IDS } from './act5Slots';
import {
  CREDITS_FIRST_MIX_KEY,
  CREDITS_LAST_MIX_KEY,
  CREDITS_LAST_TOBB_MIX_KEY,
  CREDITS_VERSE_MIX_KEYS,
  ENDING_THEME_MIX_KEY,
} from './act5Tracks';

// The Act 5 cue helpers (N8): the ending themes and the credits ballad are tracks of their own, played through the music
// service's cue slot (`setCue`, `setCueMix`) so nothing about regions or boss ids is borrowed. N11 PR 2 (the M56 scene)
// calls `playEndingTheme`; N9 and N12 PR 2 (the credits roll and the ending director) call `playCredits`, `stepCredits`
// and `stopCredits`. Every helper is a no-op without a music service (headless, or audio locked).

/** The slice of the music service these helpers use. */
export interface CueMusic {
  setCue?(trackId: string | null, mixId?: string): void;
  setCueMix?(mixId: string): void;
}

export type EndingChoice = 'rekindle' | 'let-it-die';
export type CreditsStep = 'verse1' | 'chosen' | 'last';

/** R30's four verses (`story.r30.verse`). */
export const CREDITS_VERSES = ['gaut', 'keepers', 'houses', 'walkers'] as const;
export type CreditsVerse = (typeof CREDITS_VERSES)[number];

export { CREDITS_VERSE_FLAG };

/** The mix key of R30's chosen verse; an unset, unknown or skipped verse (R30 is optional, Q12) plays the fixed first verse. */
export function creditsVerseMix(verse: string | undefined | null): string {
  const i = (CREDITS_VERSES as readonly string[]).indexOf(verse ?? '');
  return i < 0 ? CREDITS_FIRST_MIX_KEY : CREDITS_VERSE_MIX_KEYS[i];
}

/** The ending theme's track id for an M56 choice; throws on anything else (a typo must not play silence). */
export function endingThemeId(choice: string): string {
  const id = `ending.${choice}`;
  if (!ENDING_THEME_IDS.includes(id)) throw new Error(`unknown ending theme "${choice}" (expected rekindle or let-it-die)`);
  return id;
}

/** The M56 scene's music: the choice's ending theme, looping under its mix until `stopCue`. */
export function playEndingTheme(music: CueMusic | undefined | null, choice: EndingChoice): void {
  const id = endingThemeId(choice);
  music?.setCue?.(id, ENDING_THEME_MIX_KEY);
}

/** Starts the credits ballad on its first verse. */
export function playCredits(music: CueMusic | undefined | null, verse: string | undefined | null, opts: { tie?: boolean } = {}): void {
  void verse;
  void opts;
  music?.setCue?.('credits', CREDITS_FIRST_MIX_KEY);
}

/**
 * Steps the ballad: `verse1` (the fixed first verse), `chosen` (R30's verse), `last` (everyone; with `tie`, Tobb alone,
 * because a tie at the top of the favour tracks makes him sing the last verse, design 3).
 */
export function stepCredits(music: CueMusic | undefined | null, step: CreditsStep, verse: string | undefined | null, opts: { tie?: boolean } = {}): void {
  const key = step === 'verse1' ? CREDITS_FIRST_MIX_KEY : step === 'chosen' ? creditsVerseMix(verse) : opts.tie ? CREDITS_LAST_TOBB_MIX_KEY : CREDITS_LAST_MIX_KEY;
  music?.setCueMix?.(key);
}

/** Ends any cue (the ending theme or the credits); the region's own track returns. */
export function stopCue(music: CueMusic | undefined | null): void {
  music?.setCue?.(null);
}
export const stopCredits = stopCue;
