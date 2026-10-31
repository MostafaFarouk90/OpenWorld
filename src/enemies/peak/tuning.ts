/**
 * Rime Hawk and Crag Ogre numbers (design 10 rows 11 and 12; plans/act3-K6b-pr2.md sections 2 to 4). Seconds and metres.
 * Invented where the design is silent, logged in design/changes-applied.md for Mostafa's veto.
 */
export const HAWK = {
  /** Flight (HawkFlight). */
  soarAltitude: 14,
  /** The stoop's hover (its 0.8 s windup) eases down to this height. */
  hoverAltitude: 7,
  /** After the stoop it skims this low for `lowSeconds` (the rake's moment, in reach of a blade). */
  lowAltitude: 0.8,
  /** The dive from hover height to skimming height: two thirds of the stoop window (Stoop clip 0.6 s x window 0.3 to 0.85). */
  diveSeconds: 0.22,
  /** The dive's line runs on this far past the target, so the talons pass through it low (not stop at its feet). */
  diveOvershoot: 2.5,
  lowSeconds: 1.2,
  climbSeconds: 1.4,
  takeoffSeconds: 0.8,
  fallSeconds: 0.5,
  /** Circle radius round its target (or its home) while soaring. */
  soarRadius: 12,
  flySpeed: 10,
  /** Altitude follows its target height at this rate (1/s, exponential). */
  altitudeRate: 3,
  /** The hover drops to its height faster. */
  hoverRate: 6,
  /** Seconds of soaring between two stoops (seeded in this range). */
  stoopEvery: [4, 6] as const,
  /** Lying stunned after it is grounded (the Calm window), seconds; the def's `breakStaggerSeconds`. */
  groundedSeconds: 4,
  /** A calmed or retired hawk flies off this long, fading over the last `fadeSeconds`. */
  leaveSeconds: 6,
  fadeSeconds: 2,
  leaveClimb: 3,
  /** Within this of its nest it lands and perches. */
  perchRadius: 1.5,
} as const;

/** The R18 parents (plan 2.7): circle the nest; break off after one stoop once Cael backs away. */
export const HAWK_PARENT = {
  healthScale: 10,
  /** A parent starts a stoop only on a target this close to the nest. */
  stoopRadius: 10,
  /** After a stoop, a target this far from the nest is let go (it breaks off). */
  breakOffRadius: 14,
  /** It never chases a target this far from the nest. */
  leash: 20,
  /** Circles the nest this far out. */
  circleRadius: 8,
} as const;

export const OGRE = {
  /** Heavy chops deal this many times their poise (design 10 row 12). */
  heavyPoiseMultiplier: 2,
  /**
   * The bluster: once the target is within `blusterReach` it glares for this long before it swings (no swing and no throw
   * before that unless struck), so Calm "before it swings" can be reached on foot: the rock throw at 8 to 20 m would otherwise
   * close it before the player is in reach.
   */
  blusterSeconds: 3,
  /** The bluster clock runs while the target is this close (the slam's reach plus a step). */
  blusterReach: 4.5,
  /** A target that hangs back at range is pelted with rocks after this long anyway. */
  blusterMaxSeconds: 12,
  /** The walk home may take its straight-line time plus this; past it the ogre gives up the sit and walks off. */
  homeMarginSeconds: 8,
  /** Calmed, it sits until the player is this far away, or for `sitSeconds`, then walks off. */
  sitUntilPlayerMetres: 40,
  sitSeconds: 90,
  /** It walks off for this long (fading over the last `fadeSeconds`) before it is gone. */
  walkOffSeconds: 8,
  fadeSeconds: 2,
} as const;
