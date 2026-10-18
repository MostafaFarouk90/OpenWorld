import type { Anchor } from '../layout/AnchorRegistry';

export type P3 = { x: number; y: number; z: number };
export type NodeKind = 'run' | 'vault' | 'drop' | 'gap';

/**
 * A chase node; its kind says how the courier crosses to the next node (thread 17). A `gap` node sits a few metres
 * before an alley (CHASE.alleyGap wide) that the segment jumps; with a `detour` the gap is the whole segment instead,
 * crossed by the Leap or walked round by the plank.
 */
export interface RouteNode {
  id: string;
  position: P3;
  kind: NodeKind;
  /** On a gap: the plank the courier (and a player without the Leap) takes instead of jumping. */
  detour?: P3;
}

/** Thread 17 tags nodes with bare kinds (`run`, `vault`, `gap`, `drop`, plus `chase` and `elevated`); `chase-*` also reads. */
const KIND_TAGS: Record<string, NodeKind> = {
  run: 'run', vault: 'vault', drop: 'drop', gap: 'gap',
  'chase-run': 'run', 'chase-vault': 'vault', 'chase-drop': 'drop', 'chase-gap': 'gap',
};

/** Reads `<prefix>.0..n` (stopping at the first missing index) with kind tags and `.detour` anchors. */
export function routeFromAnchors(find: (id: string) => Anchor | undefined, prefix: string): RouteNode[] {
  const out: RouteNode[] = [];
  for (let i = 0; ; i++) {
    const a = find(`${prefix}.${i}`);
    if (!a) break;
    const tag = a.tags?.find((t) => t in KIND_TAGS);
    const detour = find(`${prefix}.${i}.detour`);
    out.push({ id: a.id, position: { ...a.position }, kind: tag ? KIND_TAGS[tag] : 'run', ...(detour ? { detour: { ...detour.position } } : {}) });
  }
  return out;
}

const dist = (a: P3, b: P3) => Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
export const horizontal = (a: P3, b: P3) => Math.hypot(b.x - a.x, b.z - a.z);

export interface RouteProblem {
  node: string;
  problem: string;
}

/** Shape checks: at least two nodes, finite positions, no zero-length segment, the last node is not a gap. */
export function validateRoute(nodes: readonly RouteNode[]): RouteProblem[] {
  const out: RouteProblem[] = [];
  if (nodes.length < 2) out.push({ node: nodes[0]?.id ?? '(none)', problem: 'route needs at least two nodes' });
  nodes.forEach((n, i) => {
    const p = n.position;
    if (![p.x, p.y, p.z].every(Number.isFinite)) out.push({ node: n.id, problem: 'non-finite position' });
    const next = nodes[i + 1];
    if (next && horizontal(p, next.position) < 0.05) out.push({ node: n.id, problem: 'zero-length segment' });
    if (!next && n.kind === 'gap') out.push({ node: n.id, problem: 'the last node cannot be a gap' });
  });
  return out;
}

/**
 * A polyline through points with cumulative lengths; `sampleAt` writes into `out` (no allocation per call).
 * `cum[i]` is the arc length at which `points[i]` sits.
 */
export class Polyline {
  readonly cum: number[] = [0];
  readonly length: number;

  constructor(readonly points: readonly P3[]) {
    for (let i = 1; i < points.length; i++) this.cum.push(this.cum[i - 1] + dist(points[i - 1], points[i]));
    this.length = this.cum[this.cum.length - 1] ?? 0;
  }

  /** Index of the segment containing arc length s (clamped). */
  segmentAt(s: number): number {
    if (!(s > 0)) return 0;
    let lo = 0;
    let hi = this.points.length - 2;
    if (hi < 0) return 0;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (this.cum[mid] <= s) lo = mid;
      else hi = mid - 1;
    }
    return lo;
  }

  /** Arc length of the point on the line nearest to `p` (3D); 0 for an empty line. */
  project(p: P3): number {
    const pts = this.points;
    if (pts.length < 2) return 0;
    let best = Infinity;
    let at = 0;
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i];
      const b = pts[i + 1];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dz = b.z - a.z;
      const len2 = dx * dx + dy * dy + dz * dz;
      const t = len2 > 0 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy + (p.z - a.z) * dz) / len2)) : 0;
      const d = Math.hypot(a.x + dx * t - p.x, a.y + dy * t - p.y, a.z + dz * t - p.z);
      if (d < best) {
        best = d;
        at = this.cum[i] + t * (this.cum[i + 1] - this.cum[i]);
      }
    }
    return at;
  }

  sampleAt(s: number, out: P3): P3 {
    const pts = this.points;
    if (pts.length === 0) return out;
    if (pts.length === 1 || !(s > 0) || s >= this.length) {
      const p = pts.length === 1 || !(s > 0) ? pts[0] : pts[pts.length - 1];
      out.x = p.x;
      out.y = p.y;
      out.z = p.z;
      return out;
    }
    const i = this.segmentAt(s);
    const segLen = this.cum[i + 1] - this.cum[i];
    const t = segLen > 0 ? (s - this.cum[i]) / segLen : 0;
    const a = pts[i];
    const b = pts[i + 1];
    out.x = a.x + (b.x - a.x) * t;
    out.y = a.y + (b.y - a.y) * t;
    out.z = a.z + (b.z - a.z) * t;
    return out;
  }
}

/** A point on a path with the route node it belongs to (-1 for a detour point). */
export interface PathPoint {
  position: P3;
  node: number;
}

/** The courier's line: every node, through the detour on every gap that has one. */
export function courierPath(nodes: readonly RouteNode[]): PathPoint[] {
  const out: PathPoint[] = [];
  nodes.forEach((n, i) => {
    out.push({ position: n.position, node: i });
    if (n.kind === 'gap' && n.detour) out.push({ position: n.detour, node: -1 });
  });
  return out;
}

/** The player's line: every node; `leapGaps` crosses detour gaps straight (the Leap), otherwise via the detour. */
export function playerPath(nodes: readonly RouteNode[], leapGaps: boolean): PathPoint[] {
  const out: PathPoint[] = [];
  nodes.forEach((n, i) => {
    out.push({ position: n.position, node: i });
    if (n.kind === 'gap' && n.detour && !leapGaps) out.push({ position: n.detour, node: -1 });
  });
  return out;
}
