// Bar floors (Act 5 N6, plans/act5-N6.md section 1): a boss's health stops at the floor of its next unbroken poise bar, so stray
// damage never ends a phase early and a phase never ends before its bars break (the brief's "each phase holds at its threshold
// until its bar breaks"). Floor k (0-based) holds until the boss has k + 1 breaks in all; past the last floor nothing holds.
// Pure: the encounter's damage modifier asks `barFloorHealth` and clamps the request's amount.

/**
 * Health (whole points) the boss may not drop below after `breaks` breaks in all, or 0 when every floor is lifted (or `lifted`).
 * `floors` are health fractions, strictly descending, each in [0, 1).
 */
export function barFloorHealth(maxHealth: number, floors: readonly number[], breaks: number, lifted = false): number {
  if (lifted || !(maxHealth > 0)) return 0;
  const k = Number.isFinite(breaks) ? Math.max(0, Math.floor(breaks)) : 0;
  const f = floors[k];
  if (f === undefined) return 0;
  return Math.max(1, Math.ceil(maxHealth * f));
}

/** Clamps a request's amount so health stays at or above `floor` (0: unchanged). */
export function clampToFloor(req: { amount: number }, health: number, floor: number): void {
  if (!(floor > 0)) return;
  const room = Math.max(0, health - floor);
  if (req.amount > room) req.amount = room;
}

/** Throws unless `floors` is strictly descending in [0, 1). */
export function checkFloors(floors: readonly number[]): void {
  let prev = 1;
  for (const f of floors) {
    if (!Number.isFinite(f) || f < 0 || f >= prev) throw new Error(`barFloors: floors must descend inside [0, 1) (${floors.join(', ')})`);
    prev = f;
  }
}
