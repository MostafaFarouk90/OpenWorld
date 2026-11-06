// Act 4 L3 (plans/act4-L3.md): the numbers behind the Waste's storms. Clock lengths from plan 5.2, exposure from Q4,
// the look per quality step from L0's spike (plans/act4-L0-spike.md, "Numbers this sets for Q4").
import type { QualityStep } from '../vfx/tuning';

/** Seconds. Clear and storm vary per cycle by up to their jitter either way; the warning is fixed. */
export const STORM_CLOCK = { clear: 240, clearJitter: 30, warning: 20, storm: 90, stormJitter: 15 } as const;

/** A new game's clock seed: a constant, so every playthrough and fixture sees the same storms (plan 2.1). */
export const WEATHER_SEED = 4042;

export const EXPOSURE = {
  /** Seconds between ticks. */
  interval: 3,
  /** Fraction of maximum health per tick. */
  perTick: 0.02,
  /** Exposure never takes health below this fraction of the maximum. */
  floor: 0.1,
} as const;

/** Within this many metres (horizontal) of a rope-line the player is storm-safe. */
export const ROPE_SAFE_RADIUS = 3;
/** Metres of hysteresis on a shelter's edge, so standing on the line does not chatter. */
export const SHELTER_HYSTERESIS = 1;

/** Walking speed in a storm (m/s) and the shipped walk it scales. Sprint is off while it lasts. */
export const STORM_WALK = { speed: 3, baseWalk: 4.5 } as const;

/** The look weights: the warning is a thin haze; the ramp is the seconds a change takes to blend in or out. */
export const STORM_WEIGHT = { warning: 0.2, storm: 1, rampSeconds: 3 } as const;

/** The look's edge band: 0 at this many metres outside a storm region's box, 1 this far inside it. */
export const STORM_EDGE = { outside: 150, inside: 50 } as const;

export interface StormLook {
  particles: number;
  layerAlpha: number;
  fogNear: number;
  fogFar: number;
  maskFogFar: number;
  maskLayerAlpha: number;
  /** Terrain view distance in a storm (camera far), metres. */
  viewDistance: number;
}

/** Plan 2.4. Low keeps a thin layer and 600 particles (coordinator ruling, logged in design/changes-applied.md). */
export const STORM_LOOK: Readonly<Record<QualityStep, StormLook>> = {
  high: { particles: 2000, layerAlpha: 0.55, fogNear: 12, fogFar: 140, maskFogFar: 400, maskLayerAlpha: 0.3, viewDistance: 600 },
  medium: { particles: 2000, layerAlpha: 0.55, fogNear: 12, fogFar: 140, maskFogFar: 400, maskLayerAlpha: 0.3, viewDistance: 600 },
  low: { particles: 600, layerAlpha: 0.35, fogNear: 12, fogFar: 120, maskFogFar: 360, maskLayerAlpha: 0.2, viewDistance: 500 },
};

/** Ash-grey storm colour for the fog and the sky. */
export const STORM_COLOR = 0x8a8580;

/** Act 4 ash-fall over Harrowmark (plan 2.10). */
export const ASHFALL = {
  particles: { high: 1500, medium: 1500, low: 400 } as Readonly<Record<QualityStep, number>>,
  /** Metres outside Harrowmark's box over which the ash-fall and the dusk fade out. */
  fade: 300,
  /** Every light's intensity scale at full weight. */
  lightScale: 0.45,
  duskColor: 0xc9875a,
  skyColor: 0x8a5a44,
} as const;

/** Mask item id (L7) and the flag that also grants it. */
export const ASH_MASK = { itemId: 'ash-shroud-mask', flag: 'story.m42.complete' } as const;
