// Path maths for the climbs and the carry routes: winding paths of a wanted length, resampling at an even spacing.
import type { XZ } from './inputs';

export type Path = readonly XZ[];

export function pathLength(p: Path): number {
  let l = 0;
  for (let i = 1; i < p.length; i++) l += Math.hypot(p[i]!.x - p[i - 1]!.x, p[i]!.z - p[i - 1]!.z);
  return l;
}

/** The point `s` m along the path (clamped) and its compass-free direction. */
export function pathPoint(p: Path, s: number): XZ & { dirX: number; dirZ: number } {
  let arc = 0;
  for (let i = 1; i < p.length; i++) {
    const a = p[i - 1]!;
    const b = p[i]!;
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    if (s <= arc + len || i === p.length - 1) {
      const t = len === 0 ? 0 : Math.min(Math.max((s - arc) / len, 0), 1);
      return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t, dirX: len ? (b.x - a.x) / len : 0, dirZ: len ? (b.z - a.z) / len : 1 };
    }
    arc += len;
  }
  return { ...p[0]!, dirX: 0, dirZ: 1 };
}

/**
 * A path from `from` to `to` with `bends` alternating side steps, its sideways amplitude solved so the length is `target`
 * (a straight line when `target` is not longer than the straight distance).
 */
export function windingPath(from: XZ, to: XZ, target: number, bends: number): XZ[] {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const L = Math.hypot(dx, dz);
  const build = (amp: number): XZ[] => {
    const pts: XZ[] = [from];
    for (let i = 1; i <= bends; i++) {
      const t = i / (bends + 1);
      const side = (i % 2 === 1 ? 1 : -1) * amp;
      pts.push({ x: from.x + dx * t - (dz / L) * side, z: from.z + dz * t + (dx / L) * side });
    }
    pts.push(to);
    return pts;
  };
  if (L === 0 || target <= L || bends < 1) return build(0);
  let lo = 0;
  let hi = target;
  for (let k = 0; k < 40; k++) {
    const mid = (lo + hi) / 2;
    if (pathLength(build(mid)) < target) lo = mid;
    else hi = mid;
  }
  return build((lo + hi) / 2);
}

/** Points along the path at an even spacing no larger than `maxStep` (first and last kept); fewer than two points collapse to the ends. */
export function resample(p: Path, maxStep: number): XZ[] {
  const total = pathLength(p);
  const n = Math.max(1, Math.ceil(total / maxStep));
  return Array.from({ length: n + 1 }, (_, i) => {
    const q = pathPoint(p, (total * i) / n);
    return { x: q.x, z: q.z };
  });
}
