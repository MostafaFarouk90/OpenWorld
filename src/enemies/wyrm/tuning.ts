/**
 * Ember Wyrm and Wyrmling numbers (design 10 rows 6 and 7; plans/act2-A6a.md 1.3 and 1.4). Seconds and metres.
 */
export const EMBER_WYRM = {
  /** Flight (WyrmFlight). */
  takeoffSeconds: 0.8,
  landingSeconds: 1.0,
  fallSeconds: 0.5,
  /** The dive's stoop from cruise height to the ground, about its window's length. */
  diveStoopSeconds: 0.5,
  cruiseAltitude: 5,
  strafeAltitude: 2,
  circleRadius: [9, 12] as const,
  circleSeconds: [2.5, 4] as const,
  groundSeconds: [8, 10] as const,
  /** Air speed while circling and strafing. */
  flySpeed: 9,
  /** Altitude follows its target at this rate (1/s, exponential). */
  altitudeRate: 4,
  /** A strafe pass ends this far past the player. */
  strafeOvershoot: 8,
  /** Strafes before it lands (one dive also ends the flight). */
  strafesPerFlight: 2,
  /** Landing: an open spot within this radius of the chosen point. */
  landingSearchRadius: 6,
  /** A landing that found no spot tries again after this long. */
  landingRetrySeconds: 1,
  /** Steepest ground it lands on (degrees). */
  landingMaxSlopeDeg: 35,
  /** Spit and puff jet reach (the mouth tracer), metres. */
  spitJet: 7,
} as const;

export const WYRMLING = {
  scale: 0.35,
  segments: 15,
  /** Unstruck, it keeps this band from the player. */
  keepAway: [3, 5] as const,
  /** With bread in the pack and no attack for `breadCalmSeconds`, the player may come this close. */
  breadApproach: 1.5,
  breadCalmSeconds: 2,
  puffJet: 2,
  chainLength: 2.5,
  /** Outdoors the fly-off climbs to this height and fades out this far away. */
  flyAwayAltitude: 12,
  flyAwayFadeMetres: 40,
  flyAwaySpeed: 7,
  /** Seconds between two coos at most. */
  cooEverySeconds: 4,
} as const;
