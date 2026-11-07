// Every N4 siege number in one place (plans/act5-N4.md sections 3 to 11; taste calls logged under "Act 5 N4" in
// design/changes-applied.md). Pinned by tuning.test.ts.
import { ASSIST_WINDOW_S, SIEGE_MAX_ALIVE } from '../caldera/siege';

export { ASSIST_WINDOW_S, SIEGE_MAX_ALIVE };

/** The gate (M52's Rim Gate line, R27's tunnel line): a barricade on the shipped director. */
export const GATE = {
  m52Health: 1000,
  r27Health: 800,
  /** A foot soldier's hit on the gate, as a fraction of the gate's health. */
  footHitPct: 0.005,
  /** Foot hits take at most this fraction a second off the whole gate (rams and carts stay the threat). */
  footCapPctPerS: 0.02,
  /** The gate draws foes within this many metres (horizontal) of each gate anchor. */
  tauntRadius: 10,
  /** A breach is patched to this fraction once its wave clears. */
  patchToPct: 0.3,
  /** R19's engineers mend this fraction at each wave clear. */
  engineersMendPct: 0.15,
  /** The inner posts (pikes, sappers, the watch, the Ashwalkers) stand this far inside the gate line (m). */
  innerOffset: 1.5,
  /** Gate-actor hurtbox radius (m). */
  hurtRadius: 1.0,
} as const;

/** Structures (design row 33: 600 health, wind-back 1.0 s). */
export const RAM = { strikePct: 0.15, maxHealth: 600 } as const;
export const BRAZIER = { strikePct: 0.2 } as const;

/** Intermission: an order, else `orderTimeoutS`, then the gong and `beatS`. */
export const BREAK = { orderTimeoutS: 30, beatS: 5 } as const;

/** Squad roles: reach (m), cooldown (s) and hit as a fraction of the target's max health. */
export const ROLE = {
  pikes: { range: 3.5, cooldown: 2.0, hitPct: 0.05 },
  melee: { range: 2.5, cooldown: 1.4, hitPct: 0.04 },
  /** Edric with the light blade. */
  duellist: { range: 2.5, cooldown: 1.0, hitPct: 0.04 },
  sappers: { range: 2.5, cooldown: 1.4, hitPct: 0.04 },
  archers: { volleyS: 5, arrowPct: 0.03, fieldMetres: 60 },
  healers: { everyS: 3, healPct: 0.03, radius: 6 },
} as const;

/** Allies draw foes within this radius while standing (the L4 escort pattern). */
export const ALLY_TAUNT_RADIUS = 4;
/** Wall and back-rank archers cast no shadow on these presets (the spike's finding 4). */
export const NO_SHADOW_PRESETS: readonly string[] = ['low', 'medium'];

/** Sappers stall a ram that comes within `reach` of their post. */
export const SAPPERS = { stallS: 12, reach: 6 } as const;

/** The orders' effects. */
export const ORDERS = {
  braceImpactScale: 0.5,
  looseScale: 2,
  gongBoostScale: 1.25,
  gongBoostS: 30,
} as const;

/** The siege storm: archers halved; the lee ring a shelter zone. */
export const STORM = { archerScale: 0.5, leeRadius: 14, courtHalf: 80 } as const;

/** Wystan's sally (wave 3). */
export const SALLY = { afterRamS: 15, speed: 12, hitPct: 0.2, reach: 2, ramStallS: 6, riders: 4 } as const;

/** Dragons. */
export const DRAGON = {
  telegraphS: 1.0,
  breathRadius: 6,
  breathPct: 0.25,
  firstRamPct: 0.5,
  firstRamStallS: 6,
  /** Seconds into a wave before each dragon's strike (staggered by index). */
  strikeAtS: 12,
  strikeEveryS: 9,
  loopSpeed: 14,
  /** Metres above N1's ground sky marks 1 to 6 (N1's `SIEGE_POINTS.skyHeights`, kept equal). */
  skyHeights: [45, 50, 55, 60, 65, 70] as readonly number[],
  wyrmStrafeLen: 30,
  wyrmStrafePct: 0.15,
  wyrmStrafeWidth: 3,
} as const;

/** The wounded beat: 40 s into wave 3 if no ram strike has landed first. */
export const WOUNDED = { fallbackS: 40 } as const;
