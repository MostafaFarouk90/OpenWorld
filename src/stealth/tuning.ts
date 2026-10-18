import { AI } from '../enemies/tuning';

/** Stealth tuning (design 15.7 item 75; plans/slice-2-stealth-chase.md). */
export const STEALTH = {
  /** Sneak move speed as a fraction of the walk (2.5 m/s at walk 4.5). */
  sneakSpeedScale: 0.55,
  /** Perception scales while sneaking: sight 9 m, cone 96 degrees, quiet hearing 2.4 m. */
  sneak: { sightRangeScale: 0.5, coneScale: 0.8, hearingQuietScale: 0.4, hearingLoudScale: 0.7 },
  /** Standing still while sneaking makes no footstep noise. */
  stillHearingScale: 0,
  /** Sight ray height on a sneaking player (behind waist-high cover) and on a hidden one. */
  sneakTargetHeight: 0.75,
  hiddenTargetHeight: 0.6,
  /** A hidden player is only noticed closer than this. */
  hiddenBelow: 1.5,
  /** Awareness thresholds: suspicious from 0.3, back to calm under 0.2, alerted at 1. */
  suspiciousAt: 0.3,
  calmBelow: 0.2,
  alertedAt: 1,
  /** An alerted guard that keeps sight this long catches the player; or at once within catchRadius. */
  caughtGraceSeconds: 1.2,
  catchRadius: 1.5,
  /** Ash Cloud (design 11 effect 16): 6 s. */
  ashCloudSeconds: 6,
} as const;

/** Hearing radius in metres for a player state, for the Quiet Soles ring (thread 8). */
export const HEARING = { quiet: AI.hearingQuiet, loud: AI.hearingLoud } as const;
