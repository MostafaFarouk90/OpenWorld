// A walkable route over the ground: grid A* on `heightAt` with a slope limit, then line-of-sight smoothing. The climbs (M28's,
// the Hawk Cliffs', anything on K1's real massif) follow it, so they are walkable wherever K1's cliffs put the walls.
import type { HeightFn, XZ } from './inputs';

export interface RouteOpts {
  /** Steepest rise over run any step may have (default tan 31 degrees, under the controller's 40). */
  maxSlope?: number;
  /** Grid cell in metres. */
  cell?: number;
  /** How far the search window reaches beyond the box of the two ends. */
  margin?: number;
}

export const ROUTE_MAX_SLOPE = 0.6;

/** The steepest 1 m step along a straight run (the walk test samples every metre, so the route is judged the same way). */
function worstStep(h: HeightFn, a: XZ, b: XZ): number {
  const len = Math.hypot(b.x - a.x, b.z - a.z);
  const n = Math.max(1, Math.ceil(len));
  let worst = 0;
  let prev = h(a.x, a.z);
  for (let i = 1; i <= n; i++) {
    const x = a.x + ((b.x - a.x) * i) / n;
    const z = a.z + ((b.z - a.z) * i) / n;
    const y = h(x, z);
    worst = Math.max(worst, Math.abs(y - prev) / (len / n));
    prev = y;
  }
  return worst;
}

/** A path from `from` to `to` whose every 1 m step is within `maxSlope`; null when the window holds none (a cliff in the way). */
export function routeOver(h: HeightFn, from: XZ, to: XZ, o: RouteOpts = {}): XZ[] | null {
  const maxSlope = o.maxSlope ?? ROUTE_MAX_SLOPE;
  const cell = o.cell ?? 6;
  const margin = o.margin ?? 350;
  const minX = Math.min(from.x, to.x) - margin;
  const minZ = Math.min(from.z, to.z) - margin;
  const nx = Math.ceil((Math.max(from.x, to.x) + margin - minX) / cell) + 1;
  const nz = Math.ceil((Math.max(from.z, to.z) + margin - minZ) / cell) + 1;
  const at = (i: number, j: number): XZ => ({ x: minX + i * cell, z: minZ + j * cell });
  const idx = (i: number, j: number): number => j * nx + i;
  const si = Math.round((from.x - minX) / cell);
  const sj = Math.round((from.z - minZ) / cell);
  const ei = Math.round((to.x - minX) / cell);
  const ej = Math.round((to.z - minZ) / cell);

  const g = new Float64Array(nx * nz).fill(Infinity);
  const from_ = new Int32Array(nx * nz).fill(-1);
  const closed = new Uint8Array(nx * nz);
  // Binary min-heap of [f, index].
  const heap: Array<[number, number]> = [];
  const push = (f: number, k: number): void => {
    heap.push([f, k]);
    let c = heap.length - 1;
    while (c > 0) {
      const p = (c - 1) >> 1;
      if (heap[p]![0] <= heap[c]![0]) break;
      [heap[p], heap[c]] = [heap[c]!, heap[p]!];
      c = p;
    }
  };
  const pop = (): [number, number] => {
    const top = heap[0]!;
    const last = heap.pop()!;
    if (heap.length) {
      heap[0] = last;
      let c = 0;
      for (;;) {
        const l = 2 * c + 1;
        const r = l + 1;
        let m = c;
        if (l < heap.length && heap[l]![0] < heap[m]![0]) m = l;
        if (r < heap.length && heap[r]![0] < heap[m]![0]) m = r;
        if (m === c) break;
        [heap[m], heap[c]] = [heap[c]!, heap[m]!];
        c = m;
      }
    }
    return top;
  };
  const heur = (i: number, j: number): number => Math.hypot((i - ei) * cell, (j - ej) * cell);
  g[idx(si, sj)] = 0;
  push(heur(si, sj), idx(si, sj));
  const steps: Array<[number, number]> = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1], [2, 1], [2, -1], [-2, 1], [-2, -1], [1, 2], [1, -2], [-1, 2], [-1, -2]];
  let found = false;
  while (heap.length) {
    const [, k] = pop();
    if (closed[k]) continue;
    closed[k] = 1;
    const i = k % nx;
    const j = (k - i) / nx;
    if (i === ei && j === ej) {
      found = true;
      break;
    }
    const a = at(i, j);
    for (const [di, dj] of steps) {
      const ni = i + di;
      const nj = j + dj;
      if (ni < 0 || nj < 0 || ni >= nx || nj >= nz) continue;
      const nk = idx(ni, nj);
      if (closed[nk]) continue;
      const b = at(ni, nj);
      const slope = worstStep(h, a, b);
      if (slope > maxSlope) continue;
      const d = Math.hypot(di * cell, dj * cell);
      const cost = g[k]! + d * (1 + slope);
      if (cost < g[nk]!) {
        g[nk] = cost;
        from_[nk] = k;
        push(cost + heur(ni, nj), nk);
      }
    }
  }
  if (!found) return null;
  const grid: XZ[] = [];
  for (let k = idx(ei, ej); k !== -1; k = from_[k]!) grid.push(at(k % nx, (k - (k % nx)) / nx));
  grid.reverse();
  const pts: XZ[] = [{ x: from.x, z: from.z }, ...grid.slice(1, -1), { x: to.x, z: to.z }];
  // Line-of-sight smoothing: skip ahead while the straight run stays walkable.
  const out: XZ[] = [pts[0]!];
  let i = 0;
  while (i < pts.length - 1) {
    let j = pts.length - 1;
    while (j > i + 1 && worstStep(h, pts[i]!, pts[j]!) > maxSlope) j--;
    out.push(pts[j]!);
    i = j;
  }
  return out;
}
