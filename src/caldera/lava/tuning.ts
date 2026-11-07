// N3 (plans/act5-N3.md): every lava, vent, crossing and haze number in one place. Taste calls are logged under "Act 5 N3"
// in design/changes-applied.md. The burn rate and the 10% floor are v0.9's (src/caldera/lava.ts).

export const LAVA = {
  /** Seconds in lava before Cael is thrown to a safe lip (about 6% of max lost from full at 15%/s). */
  throwAfterS: 0.4,
  /** A grounded player within this many metres of a lip (outside lava) has "passed" it: the last safe lip. */
  lipPassRadius: 3,
  /** Default depth a volume reads as lava under its surface (LavaFieldDef.depth). */
  defaultDepth: 4,
  /** Airborne feet up to this high over a surface count as over it (the lava-stair push during a Leap or a jump). */
  overHeight: 12,
  /** nearest(): volumes whose surface is more than this far above or below the given height are skipped. */
  nearestBand: 40,
} as const;

export const VENT = {
  /** Seconds before a cooled crust melts that its cracks glow and `vent.closing` fires. */
  closingWarnS: 1.5,
  /** The crust's look: seconds to cool when a vent opens, and to melt when it closes. */
  coolInS: 0.5,
  meltS: 0.3,
  /** Height of the crust's walkable collider slab (m), its top at the lava surface. */
  crustThickness: 0.3,
  /** A cooled crust (mesh and collider top) stands this far over the molten surface, above the lava's 0.35 m swell. */
  crustLift: 0.18,
} as const;

export const CROSSING = {
  /** Within this distance (x, z) of a lip end, a Leap may be aimed at the far end. */
  radius: 1.5,
  /** ... when the player faces within this many degrees of the far end. */
  coneDeg: 50,
  /** The aimed Leap's distance: the span plus this, clamped to [minDistance, maxDistance]. */
  overshoot: 0.6,
  minDistance: 4,
  maxDistance: 7.5,
  /**
   * Every crossing's span must lie in this range (the lint; the shipped Leap is 6 m). The top is maxDistance - overshoot
   * - radius, so a Leap aimed from anywhere inside the radius always reaches the far lip.
   */
  minSpan: 3.5,
  maxSpan: 5.4,
} as const;

export const HAZE = {
  /** Screen-space refraction offset at full strength (fraction of the screen). */
  strength: 0.012,
  /** Height of the haze strips lava volumes add over their surface (m). */
  cardHeight: 5,
} as const;

export const ARENA_KIT = {
  /** The breaking floor's tiles fall over this many seconds. */
  floorFallS: 0.8,
  /** Metres a broken tile falls before it is hidden. */
  floorFallM: 12,
  /** Rising lava's default seconds per level. */
  riseS: 4,
} as const;

export const LAVA_STRING_KEYS = {
  wheelHot: 'caldera.vent.wheelHot',
  wheelPrompt: 'caldera.vent.wheelPrompt',
} as const;
