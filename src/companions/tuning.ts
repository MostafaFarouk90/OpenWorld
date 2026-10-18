import { PLAYER } from '../config/constants';

/** Companion feel (companions.md section 4, plans/slice-2-tobb.md section 13). Speeds follow the player's. */
export const COMPANION_TUNING = {
  walkSpeed: PLAYER.walkSpeed,
  runSpeed: 6,
  /** Faster than the player's sprint, so a longer trail path still closes the gap. */
  sprintSpeed: PLAYER.sprintSpeed * 1.2,
  /**
   * Speed is the player's (smoothed) plus `catchUpGain` per metre of gap beyond the slot, capped at sprint; the gait
   * follows the speed with `gaitHysteresis` m/s around each edge, so he matches a sprinting player instead of
   * oscillating between run and sprint.
   */
  catchUpGain: 0.6,
  gaitHysteresis: 0.4,
  /** Once settled at the slot he waits until it is this much further than `arriveRadius` before moving again. */
  resumeMargin: 0.6,
  /** The rest slot: behind the player's facing and to one side. */
  slotBack: 3,
  slotSide: 1.2,
  arriveRadius: 0.35,
  /** Within this distance he walks straight at the slot instead of along the trail. */
  directRadius: 6,
  trailSpacing: 0.5,
  trailPoints: 96,
  /** Pure-pursuit look-ahead along the trail. */
  lookAhead: 1.5,
  /** Further than this from the trail, he heads for the player. */
  trailLostDistance: 8,
  teleportDistance: 40,
  /** A single-tick player move of at least this is a teleport (fast travel, respawn, doors). */
  jumpDistance: 8,
  stuckSeconds: 3,
  stuckProgress: 0.5,
  stuckMinDistance: 6,
  /** Radians per second. */
  turnRate: 10,
  chestHeight: 1.2,
  teleportBack: 3,
  maxRaysPerTick: 6,
  /** A wait starts or ends by relocation only out of view or at a door's black, or after this many seconds anyway. */
  handoffMaxSeconds: 10,
  /** On horseback, further back than this he is hidden until the player dismounts (no repeated teleports). */
  mountHideDistance: 40,
} as const;

export const TOBB_TUNING = {
  auraSeconds: 4,
  auraMultiplier: 1.05,
  barkCooldownSeconds: 45,
  areaWaitSeconds: 8,
  areaRepeatSeconds: 600,
  elapsedMinSeconds: 360,
  elapsedMaxSeconds: 540,
  combatEndDebounceSeconds: 2,
  combatMinSeconds: 3,
  bossQuietSeconds: 3,
  /** `interior.entered` this soon after a load or respawn is a re-emit, not a walk through a door. */
  reEmitWindowSeconds: 2,
} as const;
