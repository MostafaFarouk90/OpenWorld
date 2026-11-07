/**
 * The Warhost's numbers (Act 5 N5, plans/act5-N5.md section 2). Level-1 stats, seconds and metres. Invented where the design
 * is silent; logged under "Act 5 N5" in design/changes-applied.md.
 */
export const WARHOST = {
  maxHealth: 80,
  /** Design 10 row 32: poise 40. */
  maxPoise: 40,
  walkSpeed: 1.4,
  chaseSpeed: 2.5,
  /** The shield push shoves the player this far (metres). */
  pushShove: 2,
  /** A pike thrust reaches this far: an area circle ahead of the soldier, since the sword tracer only reaches 1.6 m. */
  pikeReach: 3.2,
  pikeAreaRadius: 0.9,
  pikeAreaOffset: 2.2,
  /** Torch glob. */
  torchSpeed: 14,
  torchMaxRange: 12,
  torchIgniteSeconds: 3,
} as const;

/** Vey's household guard: Warhost heavier, 1.1 scale, elite Spare. */
export const WARHOST_GUARD = {
  maxHealth: 180,
  maxPoise: 70,
  scale: 1.1,
} as const;

/** Beyond this distance from the player a soldier outside combat thinks at a third rate (the opt-in think LOD, plan section 8). */
export const WARHOST_LOD_DISTANCE = 28;
