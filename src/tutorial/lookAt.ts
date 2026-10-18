import type { Vec3 } from './types';

/**
 * Angle in degrees between `forward` (need not be normalised) and the direction from `from` to `target`.
 * Returns 180 when the direction or forward has zero length.
 */
export function angleDegrees(from: Vec3, forward: Vec3, target: Vec3): number {
  const dx = target.x - from.x;
  const dy = target.y - from.y;
  const dz = target.z - from.z;
  const dl = Math.hypot(dx, dy, dz);
  const fl = Math.hypot(forward.x, forward.y, forward.z);
  if (!(dl > 1e-9) || !(fl > 1e-9)) return 180;
  const c = (dx * forward.x + dy * forward.y + dz * forward.z) / (dl * fl);
  return (Math.acos(Math.max(-1, Math.min(1, c))) * 180) / Math.PI;
}
