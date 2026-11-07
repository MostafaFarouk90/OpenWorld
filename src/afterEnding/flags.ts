// The world after the ending (Act 5 N13, plans/act5-N13.md section 1; contracts v0.9 item 10; Q1 (a)): one predicate
// for everything that changes. Nothing here is saved: the state is derived from N12's `world.afterEnding` and N11's
// M56 flags, so a load re-derives it. Light on purpose (imports constants only): economy, classes and posts read it.
import { AFTER_ENDING_FLAG, M56_CHOICE_FLAG, M56_CHOICES, type M56Choice } from '../region/act5Regions';

export { AFTER_ENDING_FLAG, M56_CHOICE_FLAG };
export type { M56Choice };

/** N11's flag, written true or false with the choice (N11 exports it from quests/content/act5/foundry/flags.ts). */
export const CAEL_LIVES_FLAG = 'story.m56.caelLives';

export interface FlagReader {
  getFlag(key: string): unknown;
}

/** The world after the ending holds. */
export function afterEnding(flags: FlagReader): boolean {
  return Boolean(flags.getFlag(AFTER_ENDING_FLAG));
}

/** The final choice, or null before the ending (or with a value that is not one of the two). */
export function endingChoice(flags: FlagReader): M56Choice | null {
  if (!afterEnding(flags)) return null;
  const v = flags.getFlag(M56_CHOICE_FLAG);
  return (M56_CHOICES as readonly unknown[]).includes(v) ? (v as M56Choice) : null;
}

/** Cael died (Rekindle with 8 or more Scars): only an explicit false counts, so an older save never shows the line. */
export function caelDied(flags: FlagReader): boolean {
  return afterEnding(flags) && flags.getFlag(CAEL_LIVES_FLAG) === false;
}

/** Harrowmark's ashfall after the ending (taste call T3): gone under Rekindle, half under Let It Die, as shipped before. */
export function ashfallScale(flags: FlagReader): number {
  const c = endingChoice(flags);
  return c === 'rekindle' ? 0 : c === 'let-it-die' ? 0.5 : 1;
}
