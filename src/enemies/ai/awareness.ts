import { AI, AWARENESS, LOUD_SPEED } from '../tuning';
import type { PerceptionResult } from './perception';

export interface AwarenessStep {
  /** 0..1. */
  awareness: number;
  /** Awareness has reached 1. */
  notices: boolean;
  /** Awareness is above `AWARENESS.suspiciousAbove`. */
  suspicious: boolean;
  /** This step rose from at or below the suspicious threshold to above it: emit `ai.suspicious` once. */
  becameSuspicious: boolean;
  /** This step rose from below 1 to 1: emit `ai.spotted` once. */
  becameSpotted: boolean;
}

/**
 * Fill formula (per second, while `sees || hears`):
 *   closeness = clamp(1 - distance / sightRange, 0, 1)       sightRange = AI.sightRange * sightRangeScale (stealth-shortened)
 *   rate      = (1 / fillSeconds) * (edgeFillScale + (1 - edgeFillScale) * closeness)
 *   awareness = min(1, awareness + rate * dt)
 * so a seen target at the feet fills in `fillSeconds` and one at the edge of the sight range takes `fillSeconds / edgeFillScale`;
 * hearing alone uses the same distance rule. Otherwise it drains: `awareness = max(0, awareness - drainPerSecond * dt)`.
 *
 * Pure awareness step. Fills while the target is seen (or heard) at a rate that grows with closeness
 * (1 / `fillSeconds` at the feet, `edgeFillScale` of that at the effective sight range, `result.sightRange`, default the base range), drains at
 * `drainPerSecond` otherwise, clamped to 0..1. Edges are derived from `prev`, so a meter that drops
 * back under a threshold re-arms it.
 */
export function stepAwareness(prev: number, result: Pick<PerceptionResult, 'sees' | 'hears' | 'distance'> & { sightRange?: number }, dt: number): AwarenessStep {
  const p = Number.isFinite(prev) ? Math.min(1, Math.max(0, prev)) : 0;
  let next = p;
  if (dt > 0 && Number.isFinite(dt)) {
    if (result.sees || result.hears) {
      // Closeness is measured over the effective sight range (base range times the providers' scale), so sneaking slows detection.
      const range = result.sightRange !== undefined && result.sightRange > 0 ? result.sightRange : AI.sightRange;
      const closeness = Number.isFinite(result.distance) ? Math.min(1, Math.max(0, 1 - result.distance / range)) : 0;
      const rate = (1 / AWARENESS.fillSeconds) * (AWARENESS.edgeFillScale + (1 - AWARENESS.edgeFillScale) * closeness);
      next = Math.min(1, p + rate * dt);
    } else {
      next = Math.max(0, p - AWARENESS.drainPerSecond * dt);
    }
  }
  return {
    awareness: next,
    notices: next >= 1,
    suspicious: next > AWARENESS.suspiciousAbove,
    becameSuspicious: p <= AWARENESS.suspiciousAbove && next > AWARENESS.suspiciousAbove,
    becameSpotted: p < 1 && next >= 1,
  };
}

/** Loud means attacking, or real speed above walk speed + 0.5 m/s (`LOUD_SPEED`); a held sprint key with no movement is quiet. */
export function loudFromSpeed(speed: number, attacking: boolean): boolean {
  return attacking || (Number.isFinite(speed) && speed > LOUD_SPEED);
}

/**
 * Measures horizontal speed (m/s) from successive feet readings against simulated time. Several
 * calls in one tick share the reading; the first call has no history and reads 0.
 */
export function makeSpeedMeter(feet: () => { x: number; z: number }, seconds: () => number): () => number {
  let lastT = Number.NaN;
  let lastX = 0;
  let lastZ = 0;
  let speed = 0;
  return () => {
    const t = seconds();
    if (t === lastT) return speed;
    const f = feet();
    if (Number.isFinite(lastT) && t > lastT) speed = Math.hypot(f.x - lastX, f.z - lastZ) / (t - lastT);
    else speed = 0;
    lastT = t;
    lastX = f.x;
    lastZ = f.z;
    return speed;
  };
}
