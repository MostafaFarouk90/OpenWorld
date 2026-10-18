import type { PerceptionInput, PerceptionResult } from '../enemies/ai/perception';
import { type P3, type PerceptionModifiers, type SightBlocker, perceiveWith, stepAwareness } from './perceptionPort';
import { HEARING, STEALTH } from './tuning';

/** What stealth knows about the player each tick. */
export interface PlayerStealthState {
  sneaking: boolean;
  hidden: boolean;
  /** Moving on the ground (footsteps). */
  moving: boolean;
  /** Actually sprinting or attacking (loud). */
  loud: boolean;
  /** Product of footstep noise scales (Quiet Soles: 0). */
  noiseScale: number;
  /** Live sight blockers (Ash Cloud). */
  blockers: readonly SightBlocker[];
}

export const IDLE_PLAYER: PlayerStealthState = { sneaking: false, hidden: false, moving: false, loud: false, noiseScale: 1, blockers: [] };

const clamp01 = (n: number) => (Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 1);

/**
 * The perception modifiers stealth contributes. Null when nothing applies (not sneaking, not hidden, no blocker and
 * full noise), so enemies outside stealth behave exactly as without a provider.
 */
export function stealthModifiers(s: PlayerStealthState, out?: PerceptionModifiers): PerceptionModifiers | null {
  const noise = clamp01(s.noiseScale);
  if (!s.sneaking && !s.hidden && s.blockers.length === 0 && noise === 1) return null;
  // `out` is reused per tick by the perception provider (no allocation on the hot path).
  const m: PerceptionModifiers = out ?? { sightRangeScale: 1, coneScale: 1, hearingQuietScale: noise, hearingLoudScale: 1 };
  m.sightRangeScale = 1;
  m.coneScale = 1;
  m.hearingQuietScale = noise;
  m.hearingLoudScale = 1;
  delete m.targetHeight;
  delete m.hiddenBelow;
  delete m.blockSight;
  if (s.sneaking || s.hidden) {
    m.sightRangeScale = STEALTH.sneak.sightRangeScale;
    m.coneScale = STEALTH.sneak.coneScale;
    m.hearingQuietScale = (s.moving ? STEALTH.sneak.hearingQuietScale : STEALTH.stillHearingScale) * noise;
    m.hearingLoudScale = STEALTH.sneak.hearingLoudScale;
    m.targetHeight = STEALTH.sneakTargetHeight;
  }
  if (s.hidden) {
    m.hiddenBelow = STEALTH.hiddenBelow;
    m.targetHeight = STEALTH.hiddenTargetHeight;
    m.hearingQuietScale = 0;
  }
  if (s.blockers.length) m.blockSight = s.blockers;
  return m;
}

/** Radius in metres at which the player can be heard right now; null when not sneaking (the HUD ring hides). */
export function playerNoise(s: PlayerStealthState): number | null {
  if (!s.sneaking) return null;
  // Same numbers as stealthModifiers, without building the object (the HUD polls this per frame).
  if (s.loud) return HEARING.loud * STEALTH.sneak.hearingLoudScale;
  if (s.hidden) return 0;
  return HEARING.quiet * (s.moving ? STEALTH.sneak.hearingQuietScale : STEALTH.stillHearingScale) * clamp01(s.noiseScale);
}

export type AlertState = 'calm' | 'suspicious' | 'alerted';

export interface GuardAlert {
  state: AlertState;
  /** Seconds an alerted guard has kept continuous sight. */
  sightSeconds: number;
}

export const CALM: GuardAlert = { state: 'calm', sightSeconds: 0 };

export interface GuardRead {
  awareness: number;
  sees: boolean;
  distance: number;
}

/**
 * One fixed tick of a guard's alert level from its perception read. Alerted at full awareness; an alerted guard that
 * keeps sight for the grace, or sees the player within the catch radius, catches; losing sight drops it to
 * suspicious. Pure; never mutates `prev`.
 */
export function stepAlert(prev: GuardAlert, read: GuardRead, dt: number): { next: GuardAlert; caught: boolean } {
  const a = Number.isFinite(read.awareness) ? read.awareness : 0;
  let state: AlertState = prev.state;
  if (a >= STEALTH.alertedAt) state = 'alerted';
  else if (state === 'alerted' && !read.sees) state = 'suspicious';
  else if (state !== 'alerted') {
    if (a >= STEALTH.suspiciousAt) state = 'suspicious';
    else if (a < STEALTH.calmBelow) state = 'calm';
  }
  let sightSeconds = 0;
  let caught = false;
  if (state === 'alerted' && read.sees) {
    sightSeconds = prev.state === 'alerted' ? prev.sightSeconds + dt : dt;
    caught = sightSeconds >= STEALTH.caughtGraceSeconds - 1e-9 || read.distance <= STEALTH.catchRadius;
  }
  return { next: { state, sightSeconds }, caught };
}

/** A guard's pose for the pure detection function. */
export interface GuardPose {
  feet: P3;
  /** Yaw 0 faces -Z. */
  yaw: number;
}

/**
 * Detection as a pure function of guard pose, player pose, sneak and noise (embers-slice-2.md 3B.2): one fixed tick
 * of perception, awareness and alert. `lineOfSight` defaults to clear.
 */
export function detectTick(
  guard: GuardPose,
  playerFeet: P3,
  player: PlayerStealthState,
  prev: { awareness: number; alert: GuardAlert },
  dt: number,
  lineOfSight: PerceptionInput['lineOfSight'] = () => true,
): { awareness: number; alert: GuardAlert; caught: boolean; perceived: PerceptionResult } {
  const perceived = perceiveWith(
    {
      selfFeet: guard.feet,
      selfYaw: guard.yaw,
      targetFeet: playerFeet,
      targetAlive: true,
      targetLoud: player.loud,
      damagedBy: false,
      lineOfSight,
    },
    stealthModifiers(player),
  );
  const awareness = stepAwareness(prev.awareness, perceived, dt);
  const { next, caught } = stepAlert(prev.alert, { awareness, sees: perceived.sees, distance: perceived.distance }, dt);
  return { awareness, alert: next, caught, perceived };
}
