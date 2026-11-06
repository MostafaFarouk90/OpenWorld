// Distance to the nearest rope-line centreline (the Waste tests, the stump scatter); nearestRope stops at one cell.
import { ROPE_LINE_GEOMS } from '../region/act4/ropeLines';

export function nearestRopeDistance(x: number, z: number): number {
  let best = Infinity;
  for (const l of ROPE_LINE_GEOMS) {
    for (let i = 1; i < l.points.length; i++) {
      const [ax, az] = l.points[i - 1]!;
      const [bx, bz] = l.points[i]!;
      const dx = bx - ax;
      const dz = bz - az;
      const len2 = dx * dx + dz * dz;
      const t = len2 > 0 ? Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / len2)) : 0;
      best = Math.min(best, Math.hypot(x - ax - dx * t, z - az - dz * t));
    }
  }
  return best;
}
