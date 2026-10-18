/** Pure helpers for the Prior's positioning and his script hits (all horizontal: x and z). */

export interface XZ {
  x: number;
  z: number;
}

/**
 * The pillar to teleport to: never `current`, otherwise the one farthest from the player (ties by index).
 * Returns -1 for an empty list; with one pillar, that pillar even if it is `current`.
 */
export function pickPillar(pillars: readonly XZ[], current: number, player: XZ): number {
  if (pillars.length === 0) return -1;
  if (pillars.length === 1) return 0;
  let best = -1;
  let bestD = -Infinity;
  for (let i = 0; i < pillars.length; i++) {
    if (i === current) continue;
    const d = Math.hypot(pillars[i].x - player.x, pillars[i].z - player.z);
    if (d > bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

/** Horizontal distance from `p` to the segment a→b. */
export function distToSegment(p: XZ, a: XZ, b: XZ): number {
  const abx = b.x - a.x;
  const abz = b.z - a.z;
  const len2 = abx * abx + abz * abz;
  let t = len2 > 0 ? ((p.x - a.x) * abx + (p.z - a.z) * abz) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (a.x + abx * t), p.z - (a.z + abz * t));
}

/** Clamps `p` into the square of half-extent `half` around `centre` (in place; returns `p`). */
export function clampToArena<T extends XZ>(p: T, centre: XZ, half: number): T {
  p.x = Math.max(centre.x - half, Math.min(centre.x + half, p.x));
  p.z = Math.max(centre.z - half, Math.min(centre.z + half, p.z));
  return p;
}

/** Yaw (yaw 0 faces -Z, as the Knight and world-layout-and-npcs.md) that looks from `from` toward `to`. */
export function yawToward(from: XZ, to: XZ): number {
  return Math.atan2(-(to.x - from.x), -(to.z - from.z));
}
