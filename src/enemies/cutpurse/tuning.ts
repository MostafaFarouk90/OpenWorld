/** Alley Cutpurse tuning (design section 10 row 31; plans/slice-2-enemies.md 3.3). */
export const CUTPURSE = {
  /** The grab takes min(gold, ceil(gold * theftShare), theftCap). */
  theftShare: 0.1,
  theftCap: 40,
  /** A flee lasts at most this long, or until the player has not seen the thief this long; then it despawns. */
  fleeSeconds: 12,
  outOfSightSeconds: 5,
  /** The smoke bomb: used once per thief, after this many seconds of running. */
  smokeAfterFleeSeconds: 3,
  /** Hand-to-belt telegraph (the thief stands still), then the puff hides it this long before it blinks out. */
  smokeTelegraphSeconds: 0.4,
  smokeHiddenSeconds: 2,
  /** Flag Gerta's line reads (the quests thread owns what it means). */
  sparedFlag: 'enemies.cutpurse.spared',
} as const;

/** The gold one grab takes from a purse of `gold`: min(gold, 10% rounded up, 40); 0 for an empty or invalid purse. */
export function theftAmount(gold: number): number {
  if (!Number.isFinite(gold) || gold < 1) return 0;
  const g = Math.floor(gold);
  return Math.min(g, Math.ceil(g * CUTPURSE.theftShare), CUTPURSE.theftCap);
}
