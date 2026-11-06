import type { FlagCondition } from '../core/flagCondition';
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
  /**
   * Stuck (retry and fallback both failed) this long: release the player at the target (never below the heightfield) and lift
   * the fade. Never a black screen and a frozen player for good.
   */
  stuckRescueSeconds: 6,
  retryLift: 0.05,
  fallbackSpawnAnchor: 'brightwater.player-spawn',
} as const;

/**
 * Stones that refuse the player until a flag is set (waystone id without the `waystone.` prefix -> flag). The South
 * Gate stone stays shut until M06's route is chosen. Read through `ctx.gates`, so a load re-derives it.
 */
export const WAYSTONE_LOCKS: Readonly<Record<string, string>> = {
  'harrowmark-gate': 'story.m06.route',
  // Act 2 (A9): the Deepgate Shaft head stone is the Weeping Bellows' waystone; it stays dark until the puzzle is solved.
  'weeping-bellows': 'world.bellows.solved',
  // Act 3 (K9): both flags are derived by K9's plugins. The Mere opens on story.m26.netsCut, M26 active or completed, or an
  // already lit shrine; the Last Anvil's stone stays dark until the anvil has sounded (M30's third step) or the shrine is lit.
  'hathrens-mere': 'shrine.hathrens-mere.open',
  'last-anvil': 'shrine.last-anvil.open',
  // Act 3 (K9 PR 2): the Wyrm's Hearth stone opens with M34 (active or completed), `story.m34.complete`, or an already lit shrine.
  'wyrms-hearth': 'shrine.wyrms-hearth.open',
};

/**
 * v0.8 item 8: stones that go dark by condition (waystone id -> when). A dark stone is skipped for respawn and refuses
 * fast travel (`dark`, map text `map.blocked.dark`). Q2: Harrowmark's gate stone and every stone inside the ring wall go
 * dark from the betrayal (M38); the city stones are found by position (harrowmark/noStrand.ts), this table names the rest.
 */
export const WAYSTONE_DARK: Readonly<Record<string, FlagCondition>> = {
  'harrowmark-gate': { all: ['story.m38.complete'] },
};
