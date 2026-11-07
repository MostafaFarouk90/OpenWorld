// Act 5 N7 (plans/act5-N7.md section 2.2): the Ember Crown's two small jobs after the ending. Q1 (a) only: under Q1 (b)
// `world.afterEnding` is never set and the warmth line is dead code to delete, not a bug.
import { ACT5_TRINKETS } from './catalog';

export const CROWN_WARMTH = { id: 'item.ember-crown.warmth', factor: 1.08 } as const;
export const AFTER_ENDING_FLAG = 'world.afterEnding';

/** Max-health multiplier: +8% while the Crown is the worn trinket and the world is after the ending. */
export const crownWarmth = (trinket: string | null, afterEnding: boolean): number => (trinket === ACT5_TRINKETS.emberCrown && afterEnding ? CROWN_WARMTH.factor : 1);

/** The Crown's glow by `story.m56.choice`: gold for The Last Ember, ember-red for The Long Dawn; null before the choice. Colour only. */
export function crownTintFor(choice: unknown): number | null {
  if (choice === 'rekindle') return 0xffd36b;
  if (choice === 'let-it-die') return 0xd8431f;
  return null;
}
