// Act 4 L3 (plans/act4-L3.md 2.4): one number from 0 to 1 drives the storm's look. Pure.
import { STORM_EDGE, STORM_WEIGHT } from './tuning';
import type { ClockKind } from './clock';

export interface Box {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
}

/** Signed metres inside the box (negative outside): the distance to the nearest edge. */
export function insideDepth(box: Box, x: number, z: number): number {
  const dx = Math.min(x - box.x0, box.x1 - x);
  const dz = Math.min(z - box.z0, box.z1 - z);
  if (dx >= 0 && dz >= 0) return Math.min(dx, dz);
  const ox = Math.max(0, -dx);
  const oz = Math.max(0, -dz);
  return -Math.hypot(ox, oz);
}

/** 0 at `STORM_EDGE.outside` metres outside the box, 1 at `STORM_EDGE.inside` inside. */
export function edgeFade(depth: number): number {
  const u = (depth + STORM_EDGE.outside) / (STORM_EDGE.outside + STORM_EDGE.inside);
  return Math.min(1, Math.max(0, u));
}

export function phaseWeight(kind: ClockKind): number {
  return kind === 'storm' ? STORM_WEIGHT.storm : kind === 'warning' ? STORM_WEIGHT.warning : 0;
}

/** Moves `current` toward `target` at full scale per `STORM_WEIGHT.rampSeconds`. */
export function ramp(current: number, target: number, dt: number): number {
  const step = dt / STORM_WEIGHT.rampSeconds;
  if (!(step > 0)) return current;
  return current < target ? Math.min(target, current + step) : Math.max(target, current - step);
}
