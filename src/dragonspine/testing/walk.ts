// Test helper: the steepest slope (rise over run) along a polyline, sampled every metre.
import type { HeightFn, XZ } from '../inputs';

/** tan 40 degrees: the controller's slope limit. */
export const TAN_40 = Math.tan((40 * Math.PI) / 180);

export function worstSlope(h: HeightFn, pts: ReadonlyArray<XZ>): number {
  let worst = 0;
  let prev: { x: number; z: number; h: number } | null = null;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]!;
    const c = pts[i]!;
    const n = Math.max(1, Math.ceil(Math.hypot(c.x - a.x, c.z - a.z)));
    for (let k = 0; k <= n; k++) {
      const x = a.x + ((c.x - a.x) * k) / n;
      const z = a.z + ((c.z - a.z) * k) / n;
      const y = h(x, z);
      if (prev && Math.hypot(x - prev.x, z - prev.z) > 1e-6) worst = Math.max(worst, Math.abs(y - prev.h) / Math.hypot(x - prev.x, z - prev.z));
      prev = { x, z, h: y };
    }
  }
  return worst;
}
