/**
 * The Ashen Waste's creature numbers (Act 4 L5, plans/act4-L5.md sections 2 to 4; design 10 rows 13 to 15). Seconds,
 * metres and level-1 stats. Invented where the design is silent, logged under "Act 4 L5" in design/changes-applied.md.
 */

/** The Waste's kill XP region factor (plan 7.2, Q9): every kind killed in `ashen-waste` pays this many times its base. */
export const WASTE_KILL_XP_FACTOR = 2.4;

export const STRIDER = {
  maxHealth: 70,
  maxPoise: 40,
  walkSpeed: 1.6,
  chaseSpeed: 3.2,
  /** It holds its target between these distances (feet to feet), backing off inside `nearRange` and closing past `farRange`. */
  nearRange: 4,
  farRange: 9,
  /** A trip holds the stagger (and the Calm window) this long. */
  tripSeconds: 4,
  /** Two light hits on one leg within this many seconds trip it. */
  lightHitWindow: 4,
  lightHitsToTrip: 2,
  /** The calmed leave: walk to the poured water, drink, then walk off and fade. */
  drinkSeconds: 3,
  /** It walks to the water for at most this long, then drinks where it stands. */
  waterSeconds: 5,
  walkOffSeconds: 7,
  fadeSeconds: 2,
  /** Seconds the wet patch stays on the sand. */
  puddleSeconds: 12,
} as const;

/** The strider's procedural build and gait (StriderBody, gait.ts). */
export const STRIDER_BUILD = {
  hullLength: 1.4,
  hullRadius: 0.38,
  /** Hull centre above the ground at rest: slung low between knees that stand above it (the harvestman look). */
  hullHeight: 2.1,
  thigh: 2.0,
  shin: 2.4,
  legRadius: 0.07,
  /** Hip offsets from the hull centre (x to the side, z along the body; +Z is forward on the body). */
  hipX: 0.32,
  hipZ: 0.5,
  /** Planted foot spread from the body line, and its fore-aft rest offset beyond the hip. */
  footX: 2.0,
  footZ: 0.9,
  neck: 0.6,
  headLength: 0.55,
  /** Gait: a full cycle advances the body this far at walk; the swing lifts the foot this high. */
  stride: 1.8,
  lift: 0.5,
  /** Fraction of a cycle each foot is in the air (under 0.25 keeps three feet down at every moment). */
  swingFraction: 0.22,
  /** Hull bob amplitude (m) and sway (rad). */
  bob: 0.06,
  sway: 0.05,
} as const;

export const HUSK_KNIGHT = {
  maxHealth: 160,
  maxPoise: 90,
  walkSpeed: 1.2,
  chaseSpeed: 2.4,
  /** Model scale over the Knight (design: 1.1). */
  scale: 1.1,
  /** The chest ember stays exposed this long after the shield rush ends. */
  emberAfterRush: 1.2,
  /** The second blow of the combo may only follow the raise within this many seconds of it ending. */
  comboWindow: 1.5,
  /** Its first death: it lies in a heap this long, then rises at `riseHealth` of its maximum. */
  heapSeconds: 4,
  riseHealth: 0.5,
  /** The ember light's radius (m) and colour. */
  emberLight: 1.5,
  emberColor: 0xffa040,
  breakStaggerSeconds: 2.5,
} as const;

export const GNATS = {
  maxHealth: 24,
  chaseSpeed: 4.0,
  walkSpeed: 2.0,
  /** Points in the cloud (half on Low quality). */
  points: 140,
  radius: 1.6,
  /** Hover height of the cloud's centre. */
  hover: 1.4,
  /** The sting's contract shrinks the cloud to this fraction of its radius. */
  contract: 0.4,
  /** Scatter (death) look. */
  scatterSeconds: 1,
} as const;
