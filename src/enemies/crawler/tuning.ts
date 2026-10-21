/** The Slag Crawler's ceiling drop (design 10 row 8, invented numbers logged in design/changes-applied.md). */
export const CEILING = {
  /** The player this close (horizontal, metres) wakes a hanging crawler. */
  triggerRadius: 6,
  /** Vertical slack on top of the hang height when judging the trigger. */
  verticalSlack: 2,
  /** Rear-up and drip before the fall (a dodge window: stepping out of the 3 m circle avoids the drop). */
  dripSeconds: 0.8,
  gravity: 24,
  minHang: 1.8,
  maxHang: 5,
} as const;
