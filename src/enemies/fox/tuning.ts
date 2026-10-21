/** The Kindling Fox's guiding (design 10 row 4; numbers invented, logged in design/changes-applied.md). */
export const FOX = {
  /** The player this close (horizontal) at a stop moves it on. */
  followRadius: 7,
  /** The fox stops and waits when the player lags more than this. */
  waitDistance: 12,
  /** Arrived at a stop within this many metres. */
  arriveRadius: 1.6,
  /** Walking pace while leading. */
  leadSpeed: 3.2,
  /** Idle: it wanders within this many metres of home. */
  wanderRadius: 3,
  /** Feeding range for the Barley Cake interactable. */
  feedRadius: 3,
  feedHoldSeconds: 0.4,
  /** Anchor of the fox cache (A2's `poi.a2.fox-cache`). */
  cacheAnchor: 'poi.a2.fox-cache',
  foodItem: 'barley-cake',
} as const;
