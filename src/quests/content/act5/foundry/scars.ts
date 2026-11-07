// Act 5 N11 (plan 2.7 and Q13): the Rekindle rule. N9's journal line and N12's ending matrix import it, so the choice screen,
// Alric's disclosure and the journal can never disagree.
/** Rekindle takes Cael's life at this many Scars or more. */
export const REKINDLE_SCAR_LIMIT = 8;

/** True when Rekindle lets Cael live (fewer than REKINDLE_SCAR_LIMIT Scars). A bad count reads as 0. */
export function caelLivesFor(scars: number): boolean {
  const n = Number.isFinite(scars) && scars > 0 ? Math.floor(scars) : 0;
  return n < REKINDLE_SCAR_LIMIT;
}

/** The Scar bands the dragons' Let It Die lines read (design 9.7): how long the dragons can warm the land. */
export type ScarBand = 'light' | 'heavy' | 'grave';
export function scarBand(scars: number): ScarBand {
  const n = Number.isFinite(scars) && scars > 0 ? Math.floor(scars) : 0;
  if (n >= 12) return 'grave';
  if (n >= REKINDLE_SCAR_LIMIT) return 'heavy';
  return 'light';
}
