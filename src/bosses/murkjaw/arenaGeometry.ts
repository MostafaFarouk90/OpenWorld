// Pure helpers for Murkjaw's arena (plans/act3-K8.md section 3): where the player can stand (K3's walkways, with or without
// the phase 2 drop), how far the water wave may shove them, and which surfacing point he takes. All horizontal (x, z).
import { ARENA as DEEPS_ARENA } from '../../greyfen/deepsInterior';
import type { LocalRect } from '../../interiors/types';

export interface XZ {
  x: number;
  z: number;
}

/** The arena centre in K3's Deeps-local metres; the centre anchor's world position minus this is the local-to-world offset. */
export const LOCAL_CENTRE: XZ = { x: -28, z: -56 };

const inRect = (r: LocalRect, x: number, z: number) => x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1;

/** The arena in world metres: a translation of K3's local layout (interiors are placed by translation only). */
export class ArenaFrame {
  readonly ox: number;
  readonly oz: number;

  constructor(centreWorld: XZ) {
    this.ox = centreWorld.x - LOCAL_CENTRE.x;
    this.oz = centreWorld.z - LOCAL_CENTRE.z;
  }

  /** Inside the hall's walls (any part, water included). */
  inHall(x: number, z: number): boolean {
    return inRect(DEEPS_ARENA.hall, x - this.ox, z - this.oz);
  }

  /**
   * True where a player can stand: inside the hall and off the deep channels, or on a fixed crossing, or on the east (drop)
   * crossing while it stands. The island's wading pools count as standing (they are wade volumes).
   */
  walkable(x: number, z: number, dropStanding: boolean): boolean {
    const lx = x - this.ox;
    const lz = z - this.oz;
    if (!inRect(DEEPS_ARENA.hall, lx, lz)) return false;
    const c = DEEPS_ARENA.crossings;
    if (inRect(c.n, lx, lz) || inRect(c.s, lx, lz) || inRect(c.w, lx, lz)) return true;
    if (inRect(c.drop, lx, lz)) return dropStanding;
    return !DEEPS_ARENA.channels.some((r) => inRect(r, lx, lz));
  }

  /** On the drop crossing, or within `margin` of it. */
  nearDrop(x: number, z: number, margin: number): boolean {
    const r = DEEPS_ARENA.crossings.drop;
    const lx = x - this.ox;
    const lz = z - this.oz;
    return lx >= r.x0 - margin && lx <= r.x1 + margin && lz >= r.z0 - margin && lz <= r.z1 + margin;
  }

  /**
   * How far (0..`want`) a push from `from` along the unit direction `dir` may go and still leave the player (their capsule
   * `margin` ahead) on a walkway. Marches in `step` metres; a start that is already off a walkway gets 0.
   */
  safePush(from: XZ, dir: XZ, want: number, margin: number, dropStanding: boolean, step = 0.1): number {
    if (!(want > 0)) return 0;
    let d = 0;
    while (d + step <= want + 1e-9) {
      const n = d + step;
      const x = from.x + dir.x * (n + margin);
      const z = from.z + dir.z * (n + margin);
      if (!this.walkable(x, z, dropStanding)) break;
      d = n;
    }
    return d;
  }
}

/** The index of the point nearest `p`, skipping `exclude` unless it is the only point. -1 for an empty list. */
export function nearestIndex(points: readonly XZ[], p: XZ, exclude = -1): number {
  let best = -1;
  let bestD = Infinity;
  for (let i = 0; i < points.length; i++) {
    if (i === exclude && points.length > 1) continue;
    const d = Math.hypot(points[i].x - p.x, points[i].z - p.z);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

/** Horizontal distance from `p` to the segment a to b. */
export function distToSegment(p: XZ, a: XZ, b: XZ): number {
  const abx = b.x - a.x;
  const abz = b.z - a.z;
  const len2 = abx * abx + abz * abz;
  let t = len2 > 0 ? ((p.x - a.x) * abx + (p.z - a.z) * abz) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (a.x + abx * t), p.z - (a.z + abz * t));
}
