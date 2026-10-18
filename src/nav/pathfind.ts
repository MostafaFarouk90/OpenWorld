import type { Vec3 } from '../physics/PhysicsWorld';
import type { NavGrid } from './NavGrid';

const SQRT2 = Math.SQRT2;
/** Neighbour offsets: orthogonals first, then diagonals (fixed order for deterministic ties). */
const DX = [0, 1, 0, -1, 1, 1, -1, -1];
const DZ = [-1, 0, 1, 0, -1, 1, 1, -1];

/** Per-grid scratch so repeated queries allocate nothing large. */
interface Scratch {
  stamp: number;
  seen: Uint32Array;
  closed: Uint32Array;
  g: Float32Array;
  f: Float32Array;
  parent: Int32Array;
  heap: Int32Array;
  pos: Int32Array;
  size: number;
  valid: Uint8Array;
}

const scratch = new WeakMap<NavGrid, Scratch>();

function scratchFor(grid: NavGrid): Scratch {
  let s = scratch.get(grid);
  if (!s) {
    const n = grid.cols * grid.rows;
    s = {
      stamp: 0,
      seen: new Uint32Array(n),
      closed: new Uint32Array(n),
      g: new Float32Array(n),
      f: new Float32Array(n),
      parent: new Int32Array(n),
      heap: new Int32Array(n),
      pos: new Int32Array(n),
      size: 0,
      valid: new Uint8Array(n),
    };
    scratch.set(grid, s);
  }
  return s;
}

function heapLess(s: Scratch, a: number, b: number): boolean {
  const fa = s.f[a]!;
  const fb = s.f[b]!;
  if (fa !== fb) return fa < fb;
  const ga = s.g[a]!;
  const gb = s.g[b]!;
  if (ga !== gb) return ga > gb;
  return a < b;
}

function heapUp(s: Scratch, from: number): void {
  let k = from;
  const item = s.heap[k]!;
  while (k > 0) {
    const p = (k - 1) >> 1;
    const pi = s.heap[p]!;
    if (!heapLess(s, item, pi)) break;
    s.heap[k] = pi;
    s.pos[pi] = k;
    k = p;
  }
  s.heap[k] = item;
  s.pos[item] = k;
}

function heapDown(s: Scratch, from: number): void {
  let k = from;
  const item = s.heap[k]!;
  for (;;) {
    let c = 2 * k + 1;
    if (c >= s.size) break;
    if (c + 1 < s.size && heapLess(s, s.heap[c + 1]!, s.heap[c]!)) c++;
    const ci = s.heap[c]!;
    if (!heapLess(s, ci, item)) break;
    s.heap[k] = ci;
    s.pos[ci] = k;
    k = c;
  }
  s.heap[k] = item;
  s.pos[item] = k;
}

function heapPop(s: Scratch): number {
  const top = s.heap[0]!;
  s.size--;
  if (s.size > 0) {
    s.heap[0] = s.heap[s.size]!;
    s.pos[s.heap[0]!] = 0;
    heapDown(s, 0);
  }
  s.pos[top] = -1;
  return top;
}

/** Marks cells that are walkable with clearance >= radius. */
function fillValid(grid: NavGrid, s: Scratch, radius: number): void {
  const n = grid.cols * grid.rows;
  for (let i = 0; i < n; i++) s.valid[i] = grid.isWalkable(i) && grid.clearance(i) >= radius - 1e-6 ? 1 : 0;
}

/** Nearest valid cell to a point by ring search; -1 when the grid has none. Bounded by the cell count. */
function nearestValid(grid: NavGrid, s: Scratch, x: number, z: number): number {
  const { cols, rows, cellSize, minX, minZ } = grid;
  const cx = Math.min(cols - 1, Math.max(0, Math.floor((x - minX) / cellSize)));
  const cz = Math.min(rows - 1, Math.max(0, Math.floor((z - minZ) / cellSize)));
  let best = -1;
  let bestD = Infinity;
  let found = -1;
  const maxR = Math.max(cols, rows);
  for (let r = 0; r <= maxR; r++) {
    if (found >= 0 && r > found + 1) break;
    for (let dz = -r; dz <= r; dz++) {
      const nz = cz + dz;
      if (nz < 0 || nz >= rows) continue;
      const edge = Math.abs(dz) === r;
      for (let dx = -r; dx <= r; dx += edge || r === 0 ? 1 : 2 * r) {
        const nx = cx + dx;
        if (nx < 0 || nx >= cols) continue;
        const i = nz * cols + nx;
        if (!s.valid[i]) continue;
        const px = minX + (nx + 0.5) * cellSize - x;
        const pz = minZ + (nz + 0.5) * cellSize - z;
        const d = px * px + pz * pz;
        if (d < bestD || (d === bestD && i < best)) {
          bestD = d;
          best = i;
        }
        if (found < 0) found = r;
      }
    }
  }
  return best;
}

/** True when the segment (grid-space cell units) only touches valid cells (supercover, so corners are never cut). */
function lineOfSight(grid: NavGrid, s: Scratch, ax: number, az: number, bx: number, bz: number): boolean {
  const { cols, rows, cellSize, minX, minZ } = grid;
  const x0 = (ax - minX) / cellSize;
  const z0 = (az - minZ) / cellSize;
  const x1 = (bx - minX) / cellSize;
  const z1 = (bz - minZ) / cellSize;
  let ix = Math.floor(x0);
  let iz = Math.floor(z0);
  const ex = Math.floor(x1);
  const ez = Math.floor(z1);
  const ok = (cx: number, cz: number): boolean => cx >= 0 && cz >= 0 && cx < cols && cz < rows && s.valid[cz * cols + cx] === 1;
  if (!ok(ix, iz)) return false;
  const dx = x1 - x0;
  const dz = z1 - z0;
  const sx = dx > 0 ? 1 : -1;
  const sz = dz > 0 ? 1 : -1;
  const tdx = dx === 0 ? Infinity : Math.abs(1 / dx);
  const tdz = dz === 0 ? Infinity : Math.abs(1 / dz);
  let tx = dx === 0 ? Infinity : dx > 0 ? (ix + 1 - x0) / dx : (x0 - ix) / -dx;
  let tz = dz === 0 ? Infinity : dz > 0 ? (iz + 1 - z0) / dz : (z0 - iz) / -dz;
  let guard = Math.abs(ex - ix) + Math.abs(ez - iz) + 2;
  while ((ix !== ex || iz !== ez) && guard-- > 0) {
    if (Math.abs(tx - tz) < 1e-9) {
      if (!ok(ix + sx, iz) || !ok(ix, iz + sz)) return false;
      ix += sx;
      iz += sz;
      tx += tdx;
      tz += tdz;
    } else if (tx < tz) {
      ix += sx;
      tx += tdx;
    } else {
      iz += sz;
      tz += tdz;
    }
    if (!ok(ix, iz)) return false;
  }
  return ix === ex && iz === ez;
}

/**
 * Shortest smoothed path on a grid for an agent of `radius` metres, from a point inside the grid.
 * Returns world waypoints at floorY excluding the start, ending at `to` (or the nearest reachable cell
 * centre when `to` is blocked, outside the grid or unreachable). [] when the grid has no valid cell.
 */
export function findPath(grid: NavGrid, from: Vec3, to: Vec3, radius: number): Vec3[] {
  const r = Math.max(0, radius);
  const s = scratchFor(grid);
  fillValid(grid, s, r);
  const { cols, rows, minX, minZ, maxX, maxZ, floorY } = grid;
  const centre = (i: number): Vec3 => grid.cellCentre(i);

  let fx = Math.min(maxX - 1e-6, Math.max(minX, from.x));
  let fz = Math.min(maxZ - 1e-6, Math.max(minZ, from.z));
  let start = grid.cellIndex(fx, fz);
  if (start < 0 || !s.valid[start]) {
    start = nearestValid(grid, s, fx, fz);
    if (start < 0) return [];
    const c = centre(start);
    fx = c.x;
    fz = c.z;
  }

  const tx0 = Math.min(maxX - 1e-6, Math.max(minX, to.x));
  const tz0 = Math.min(maxZ - 1e-6, Math.max(minZ, to.z));
  let goal = grid.cellIndex(tx0, tz0);
  let exact = goal >= 0 && s.valid[goal] === 1;

  const stamp = ++s.stamp;
  // Unreachable-or-blocked target: flood from the start, pick the reached cell nearest the target.
  const floodNearest = (): number => {
    let sp = 0;
    const stack = s.heap;
    stack[sp++] = start;
    s.seen[start] = stamp;
    let best = start;
    let bestD = Infinity;
    while (sp > 0) {
      const i = stack[--sp]!;
      const ix = i % cols;
      const iz = (i - ix) / cols;
      const c = centre(i);
      const d = (c.x - tx0) * (c.x - tx0) + (c.z - tz0) * (c.z - tz0);
      if (d < bestD || (d === bestD && i < best)) {
        bestD = d;
        best = i;
      }
      for (let k = 0; k < 8; k++) {
        const nx = ix + DX[k]!;
        const nz = iz + DZ[k]!;
        if (nx < 0 || nz < 0 || nx >= cols || nz >= rows) continue;
        const j = nz * cols + nx;
        if (!s.valid[j] || s.seen[j] === stamp) continue;
        if (k >= 4 && (!s.valid[iz * cols + nx] || !s.valid[nz * cols + ix])) continue;
        s.seen[j] = stamp;
        stack[sp++] = j;
      }
    }
    return best;
  };
  if (!exact) goal = floodNearest();

  // A*
  const astamp = ++s.stamp;
  const gx = goal % cols;
  const gz = (goal - gx) / cols;
  const heuristic = (i: number): number => {
    const ix = i % cols;
    const iz = (i - ix) / cols;
    const ddx = Math.abs(ix - gx);
    const ddz = Math.abs(iz - gz);
    return ddx + ddz + (SQRT2 - 2) * Math.min(ddx, ddz);
  };
  s.g[start] = 0;
  s.f[start] = heuristic(start);
  s.parent[start] = -1;
  s.seen[start] = astamp;
  s.heap[0] = start;
  s.pos[start] = 0;
  s.size = 1;
  let reached = -1;
  let bestClosed = start;
  let bestClosedD = Infinity;
  while (s.size > 0) {
    const i = heapPop(s);
    s.closed[i] = astamp;
    if (i === goal) {
      reached = i;
      break;
    }
    const ix = i % cols;
    const iz = (i - ix) / cols;
    const c = centre(i);
    const d = (c.x - tx0) * (c.x - tx0) + (c.z - tz0) * (c.z - tz0);
    if (d < bestClosedD || (d === bestClosedD && i < bestClosed)) {
      bestClosedD = d;
      bestClosed = i;
    }
    for (let k = 0; k < 8; k++) {
      const nx = ix + DX[k]!;
      const nz = iz + DZ[k]!;
      if (nx < 0 || nz < 0 || nx >= cols || nz >= rows) continue;
      const j = nz * cols + nx;
      if (!s.valid[j] || s.closed[j] === astamp) continue;
      if (k >= 4 && (!s.valid[iz * cols + nx] || !s.valid[nz * cols + ix])) continue;
      const ng = s.g[i]! + (k >= 4 ? SQRT2 : 1);
      const queued = s.seen[j] === astamp;
      if (queued && ng >= s.g[j]!) continue;
      s.g[j] = ng;
      s.f[j] = ng + heuristic(j);
      s.parent[j] = i;
      if (queued) {
        heapUp(s, s.pos[j]!);
      } else {
        s.seen[j] = astamp;
        s.heap[s.size] = j;
        s.pos[j] = s.size;
        s.size++;
        heapUp(s, s.size - 1);
      }
    }
  }
  if (reached < 0) {
    // The exact target cell is valid but unreachable: end at the closed cell nearest to it.
    reached = bestClosed;
    exact = false;
  }

  // Cell chain start -> reached.
  const chain: number[] = [];
  for (let i = reached; i >= 0; i = s.parent[i]!) chain.push(i);
  chain.reverse();

  const endX = exact ? tx0 : centre(reached).x;
  const endZ = exact ? tz0 : centre(reached).z;
  if (chain.length === 1) return [{ x: endX, y: floorY, z: endZ }];

  // String-pull: start point, interior cell centres, end point.
  const pts: { x: number; z: number }[] = [{ x: fx, z: fz }];
  for (let k = 1; k < chain.length - 1; k++) {
    const c = centre(chain[k]!);
    pts.push({ x: c.x, z: c.z });
  }
  pts.push({ x: endX, z: endZ });
  const out: Vec3[] = [];
  let a = 0;
  for (let j = 1; j < pts.length; j++) {
    if (j + 1 < pts.length && lineOfSight(grid, s, pts[a]!.x, pts[a]!.z, pts[j + 1]!.x, pts[j + 1]!.z)) continue;
    out.push({ x: pts[j]!.x, y: floorY, z: pts[j]!.z });
    a = j;
  }
  return out;
}
