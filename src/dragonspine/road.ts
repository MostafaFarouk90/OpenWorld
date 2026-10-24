// The Rime Pass as a polyline with arc-length queries. Same maths as `roadPoint('rime-pass', ...)` (a test pins it) but over
// the polyline in the inputs, so a shifted road moves everything built on it.
export interface RoadPoint {
  x: number;
  z: number;
  dirX: number;
  dirZ: number;
}

export interface Road {
  points: readonly (readonly [number, number])[];
  length: number;
  /** The point `s` m along the road (clamped), `side` m to the left of travel (negative: right). */
  point(s: number, side?: number): RoadPoint;
  /** Nearest point on the centre line: its arc position and distance. */
  nearest(x: number, z: number): { s: number; d: number };
}

export function roadFromPoints(points: readonly (readonly [number, number])[]): Road {
  if (points.length < 2) throw new Error('dragonspine: the road needs two points');
  const lens: number[] = [];
  let length = 0;
  for (let i = 1; i < points.length; i++) {
    const l = Math.hypot(points[i]![0] - points[i - 1]![0], points[i]![1] - points[i - 1]![1]);
    if (!(l > 1e-6)) throw new Error('dragonspine: the road has a zero-length segment');
    lens.push(l);
    length += l;
  }
  const point = (s: number, side = 0): RoadPoint => {
    let arc = 0;
    for (let i = 1; i < points.length; i++) {
      const [ax, az] = points[i - 1]!;
      const [bx, bz] = points[i]!;
      const len = lens[i - 1]!;
      if (s <= arc + len || i === points.length - 1) {
        const t = Math.min(Math.max((s - arc) / len, 0), 1);
        const dirX = (bx - ax) / len;
        const dirZ = (bz - az) / len;
        return { x: ax + (bx - ax) * t - dirZ * side, z: az + (bz - az) * t + dirX * side, dirX, dirZ };
      }
      arc += len;
    }
    throw new Error('unreachable');
  };
  const nearest = (x: number, z: number): { s: number; d: number } => {
    let best = { s: 0, d: Infinity };
    let arc = 0;
    for (let i = 1; i < points.length; i++) {
      const [ax, az] = points[i - 1]!;
      const [bx, bz] = points[i]!;
      const len = lens[i - 1]!;
      const t = Math.min(Math.max(((x - ax) * (bx - ax) + (z - az) * (bz - az)) / (len * len), 0), 1);
      const d = Math.hypot(x - (ax + (bx - ax) * t), z - (az + (bz - az) * t));
      if (d < best.d) best = { s: arc + t * len, d };
      arc += len;
    }
    return best;
  };
  return { points, length, point, nearest };
}
