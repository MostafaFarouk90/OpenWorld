export const WAYSTONE_TUNING = {
  rekindleHoldSeconds: 1.2,
  restHoldSeconds: 1.0,
  interactRadius: 2.5,
  restBlockedAggroRadius: 30,
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
