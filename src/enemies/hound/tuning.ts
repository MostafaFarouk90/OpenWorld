/**
 * Ember Hound tuning (design section 10 row 3, plans/slice-2-enemies.md 3.2). Kept out of `enemies/tuning.ts`
 * so the shared file stays untouched; values the plan names are marked.
 */
export const HOUND = {
  /** Plan: attack tokens for hounds are 3 (`EnemyDef.attackersPerTarget`). */
  attackersPerTarget: 3,
  /** Plan: pounces of a pack start at least this far apart. */
  attackStaggerSeconds: 0.5,
  /** Plan: a packmate within this distance puts a hound into the circle phase. */
  packRadius: 15,
  /** Plan: circle at 4 to 5 m. Outside the band the hound steers to the middle of it. */
  circleMin: 4,
  circleMax: 5,
  /** Plan: 1.5 to 3 s of circling with a packmate in range; alone, 1 s. */
  packCircleMin: 1.5,
  packCircleMax: 3,
  aloneCircleSeconds: 1,
  /** The circle clock only runs once the hound is this close to the target (the approach is not circling). */
  ringJoinDistance: 6,
  /** Stalking speed on the ring (m/s); the approach to the ring uses the chase speed. */
  circleSpeed: 2.5,
  /** The goal sits this far ahead along the ring (radians), so the hound keeps moving round the target. */
  circleLeadRadians: 0.5,
  /** Plan: Knockdown, 1.2 s down (equal to `AI.breakStaggerSeconds`; separate so a dodge counter can tune alone). */
  knockdownSeconds: 1.2,
  /** After `player.dodged { attackerId: hound }` the next player hit on that hound within this window is a dodge counter. */
  dodgeCounterSeconds: 1.0,
  /** Pounce: stop this far short of the target when it is nearer than the full leap. */
  leapStopShort: 0.9,
} as const;

/** The burning bite: `status.apply(target, { id, kind: 'ignite', dps, seconds, sourceId })`, once per swing. */
export const BURNING_BITE = {
  id: 'hound-bite',
  dps: 2,
  seconds: 4,
} as const;
