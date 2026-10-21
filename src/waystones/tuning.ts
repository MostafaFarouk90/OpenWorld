export const WAYSTONE_TUNING = {
  rekindleHoldSeconds: 1.2,
  restHoldSeconds: 1.0,
  interactRadius: 2.5,
  restBlockedAggroRadius: 30,
  /** A foe that aggroed and never calmed (lost the player, got stuck) stops blocking rest and travel while beyond this distance (m). */
  staleAggroDistance: 60,
  /** Fade to black before a teleport. */
  fadeOutSeconds: 0.3,
  fadeInSeconds: 0.4,
  /** Give up waiting for collider patch + ground ray after this long. */
  settleTimeoutSeconds: 2,
  /** Render chunks may take at most this long before the fade lifts anyway. */
  revealTimeoutSeconds: 3,
  groundRayMaxDistance: 0.5,
  retryLift: 0.05,
  fallbackSpawnAnchor: 'brightwater.player-spawn',
} as const;

/**
 * Stones that refuse the player until a flag is set (waystone id without the `waystone.` prefix -> flag). The South
 * Gate stone stays shut until M06's route is chosen. Read through `ctx.gates`, so a load re-derives it.
 */
export const WAYSTONE_LOCKS: Readonly<Record<string, string>> = {
  'harrowmark-gate': 'story.m06.route',
};
