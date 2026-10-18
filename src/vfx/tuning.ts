// Tunables for thread 7 (design section 11.0 to 11.4 and 9.7). Shared constants live here, never in
// src/config/constants.ts.

export const HIT_STACK = {
  normal: { hitStop: 0.05, stab: 0.06, shake: 0.03, shakeSeconds: 0.1, fov: 2, sparks: 24 },
  heavy: { hitStop: 0.09, kill: 0.1, shake: 0.12, shakeSeconds: 0.25, fov: 5, sparks: 48 },
  blocked: { hitStop: 0.03, sparks: 12 },
  parried: { hitStop: 0.07, shake: 0.05, shakeSeconds: 0.12, fov: 2 },
  /** A spell hit damps shake, FOV and hit-stop so a multi-target Surge does not stack them. */
  spellDamp: 0.35,
} as const;

/** Clip names of the attacks that count as heavy (attack 3) and as the stab (attack 4). */
export const HEAVY_ATTACKS: ReadonlySet<string> = new Set(['1H_Melee_Attack_Chop']);
export const STAB_ATTACKS: ReadonlySet<string> = new Set(['1H_Melee_Attack_Stab']);

export const CAPS = {
  trails: 6,
  trailSegments: 24,
  sparkInstances: 600,
  pointSlots: 3400,
  particlesTotal: 4000,
  pointLights: 4,
  decals: 24,
  decalsLow: 16,
  decalFadeSeconds: 20,
} as const;

/** Attack trail colour ramps (hex, tail to freshest): 1 gold, 2 orange, 3 white-hot, 4 thin gold. */
export const TRAIL_RAMPS: Record<string, { colors: [number, number, number]; tail: number; width: number }> = {
  '1H_Melee_Attack_Slice_Horizontal': { colors: [0xb8741a, 0xf0b030, 0xfff1b8], tail: 0.2, width: 1 },
  '1H_Melee_Attack_Slice_Diagonal': { colors: [0xa03a10, 0xff7a20, 0xffd890], tail: 0.2, width: 1 },
  '1H_Melee_Attack_Chop': { colors: [0xd08a30, 0xfff0c0, 0xffffff], tail: 0.28, width: 1.3 },
  '1H_Melee_Attack_Stab': { colors: [0xb8741a, 0xf0b030, 0xfff1b8], tail: 0.2, width: 0.45 },
};
export const DEFAULT_TRAIL = { colors: [0x8a4a14, 0xe08a20, 0xffe8b0] as [number, number, number], tail: 0.2, width: 1 };
/** The player's ribbon starts this far (normalised clip time) before `activeStart`. */
export const TRAIL_LEAD = 0.02;

export const QUALITY = {
  low: { renderScale: 0.75, shadows: 'off', shadowDistance: 0, viewDistanceOffset: -1, bloom: false, particleScale: 0.5, decals: 0 },
  medium: { renderScale: 0.9, shadows: 'half', shadowDistance: 40, viewDistanceOffset: 0, bloom: true, particleScale: 1, decals: 16 },
  high: { renderScale: 1, shadows: 'full', shadowDistance: 80, viewDistanceOffset: 0, bloom: true, particleScale: 1, decals: 24 },
} as const;
export type QualityStep = keyof typeof QUALITY;
export const QUALITY_STORAGE_KEY = 'owg.quality.v1';

/** Frame probe and governor (design 14.7). */
export const PROBE = {
  warmupFrames: 30,
  sampleFrames: 180,
  ignoreAboveMs: 250,
  highMaxMs: 18,
  mediumMaxMs: 28,
  governorWindowSeconds: 5,
  governorDropAboveMs: 33,
  governorOfferRaiseAfterSeconds: 60,
  governorRaiseBelowMs: 20,
} as const;

/** Burn and the Surge (design 9.7). Max-health loss and Scars are deferred, see spells/Burn.ts. */
export const BURN = {
  max: 100,
  surgeGain: 25,
  rekindleGain: 10,
  blazeAt: 40,
  cinderAt: 75,
  decayPerSecond: 0.2,
  combatHysteresisSeconds: 6,
  vignetteGlowAbove: 25,
} as const;

export const EMBER = { max: 100, start: 100, regenPerSecond: 2, regenDelayAfterSpendSeconds: 2 } as const;

export const SURGE = {
  spellId: 'heartshard-surge',
  clip: 'Spellcast_Raise',
  emberCost: 40,
  cooldown: 6,
  /** Absolute gameplay and visual radii per Burn zone (design 9.7: 6 m ring, 8 m Dawnwave arc, 10 m Cinderburst). */
  zoneRadius: { warm: 6, blaze: 8, cinder: 10 },
  radius: 6,
  /** Cinderburst breaks the poise of everything in range. */
  cinderPoise: 999,
  damage: 15,
  poise: 40,
  healFraction: 0.05,
  hitStop: 0.05,
} as const;

export const RALLY = {
  skillId: 'knight.rallyCry',
  clip: 'Cheer',
  emberCost: 15,
  cooldown: 8,
  radius: 8,
  staminaFraction: 0.1,
} as const;
