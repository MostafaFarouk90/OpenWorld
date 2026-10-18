// Tuning for the Knight's combat verbs. Values come from the design (section 2, 9, 9.6, 11.0, 11.3) where it names
// them and are game-feel defaults otherwise. Durations are in whole fixed ticks (60 per second).
import { FIXED_TIMESTEP } from '../config/constants';

/** Seconds to whole ticks. */
export const ticks = (seconds: number): number => Math.round(seconds / FIXED_TIMESTEP);

export const STAMINA = {
  /** Regeneration per second once the delay has passed. */
  regenPerSecond: 25,
  /** Regeneration is multiplied by this while the guard is up. */
  blockRegenScale: 0.5,
  regenDelayTicks: ticks(0.8),
  /** Reaching 0 exhausts the Knight until this much is regained. */
  exhaustRecover: 25,
  /** Sprint drain per second. */
  sprintPerSecond: 10,
  /** Only the heavy attack (3) costs stamina; attacks 1, 2 and 4 are free. */
  heavyAttackCost: 18,
  dodgeCost: 20,
  /** A blocked hit costs this plus BLOCK_HIT_RAW_SCALE x the raw damage. */
  blockHitBase: 10,
  blockHitRawScale: 0.5,
} as const;

export const GUARD = {
  /** Half-angle of the front arc that a block covers, in radians (100 degrees). */
  arcHalfAngle: (100 * Math.PI) / 180,
  /** Damage and poise that get through a block. */
  blockedScale: 0.2,
  /** Block pressed this many ticks before a swing's window opens (or at the open tick) is a parry. */
  parryLeadTicks: ticks(0.2),
  /** Block is refused for this long after a guard break. */
  guardBreakLockoutTicks: ticks(1),
} as const;

export const DODGE = {
  /** Dodge_* clips are 0.4 s long in Knight.glb. */
  totalTicks: 24,
  /** Inclusive tick indices (0 = the tick the dodge starts) during which hits resolve as immune. */
  iFrameStart: 2,
  iFrameEnd: 16,
  distance: 4.5,
} as const;

export const POISE = {
  /** A hit with at least this much poise damage staggers even when poise remains (design 9.6 heavy hit). */
  heavyPoise: 30,
  flinchTicks: ticks(0.3),
  heavyStaggerTicks: ticks(0.8),
  breakStaggerTicks: ticks(1.2),
  knockbackMetres: 1.2,
  /** Poise refills after this long without taking damage (design 9.6). */
  regenDelayTicks: ticks(4),
} as const;

export const SECOND_WIND = {
  healthFraction: 0.5,
  burstRadius: 8,
  /** Poise handed to damage.stagger so the burst always breaks. */
  burstPoise: 999,
  graceTicks: ticks(1.5),
  defaultCharges: 1,
} as const;

export const RESPAWN = {
  delayTicks: ticks(2.5),
  graceTicks: ticks(1.5),
  healthFraction: 1,
  /** Share of carried gold dropped as the gold pouch (design section 2). */
  pouchGoldShare: 0.1,
  pouchHoldSeconds: 0.5,
} as const;

export const LOCK_ON = {
  range: 20,
  releaseRange: 25,
  /** Half-angle of the camera cone candidates must be inside, in radians (70 degrees). */
  coneHalfAngle: (70 * Math.PI) / 180,
  lostSightTicks: ticks(2),
  swapMousePixels: 80,
  swapWindowTicks: ticks(0.25),
  swapCooldownTicks: ticks(0.4),
  reacquireRange: 12,
} as const;

/** Orders inside the shared phases (contract: intent 0..99 after enemy AI, afterCombat 0..99). */
export const ORDER = {
  verbs: 10,
  lockOn: 20,
  stamina: 30,
  reactions: 10,
  death: 20,
  /** damage modifier and lethal handler orders */
  guardModifier: -50,
  secondWindHandler: -100,
} as const;
