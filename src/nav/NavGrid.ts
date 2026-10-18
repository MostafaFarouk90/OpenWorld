import type { Vec3 } from '../physics/PhysicsWorld';

/** An axis-aligned rectangle in world metres (x0 < x1, z0 < z1). */
export interface NavRect {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
}

/** Definition of one flat-floored navigation grid (an interior, a yard). */
export interface NavGridDef {
  id: string;
  /** Grid bounds in world metres. */
  minX: number;
  minZ: number;
  maxX: number;
  maxZ: number;
  /** One flat floor height for the whole grid. */
  floorY: number;
  /** Cell edge in metres (default 0.5). */
  cellSize?: number;
  /** Vertical half-band around floorY that counts as "in the grid" (default 2.5). */
  band?: number;
  /** Union of these is the walkable area. */
  walkable: NavRect[];
  /** Subtracted from the walkable area (pillars). */
  blocked?: NavRect[];
  /** Named dynamic obstacles (doors); initially open, so they do not block. */
  blockers?: Record<string, NavRect[]>;
}

/**
 * A cell grid over one flat floor (pure: no Three, no Rapier). A cell is walkable when its centre is in
 * a walkable rect, in no blocked rect and in no closed blocker. `clearance(i)` is the distance from the
 * cell centre to the nearest non-walkable cell centre (cells outside the grid count as non-walkable)
 * minus half a cell, so a cell touching a wall has clearance cellSize / 2 (0.25 at the default 0.5 m): the
 * gap from the cell centre to the wall face.
 */
export class NavGrid {
  readonly id: string;
  readonly cellSize: number;
  readonly cols: number;
  readonly rows: number;
  readonly floorY: number;
  readonly minX: number;
  readonly minZ: number;
  readonly maxX: number;
  readonly maxZ: number;
  readonly band: number;

  private readonly base: Uint8Array;
  private readonly walk: Uint8Array;
  private readonly clear: Float32Array;
  private readonly comp: Int32Array;
  private readonly blockers = new Map<string, { rects: NavRect[]; closed: boolean }>();
  private readonly stack: Int32Array;
  private readonly edtF: Float64Array;
  private readonly edtD: Float64Array;
  private readonly edtOut: Float64Array;
  private readonly edtV: Int32Array;
  private readonly edtZ: Float64Array;

  constructor(def: NavGridDef) {
    this.id = def.id;
    this.cellSize = def.cellSize ?? 0.5;
    if (!(this.cellSize > 0)) throw new Error(`NavGrid "${def.id}": cellSize must be > 0`);
    this.minX = def.minX;
    this.minZ = def.minZ;
    this.maxX = def.maxX;
    this.maxZ = def.maxZ;
    this.floorY = def.floorY;
    this.band = def.band ?? 2.5;
    this.cols = Math.max(1, Math.ceil((def.maxX - def.minX) / this.cellSize - 1e-9));
    this.rows = Math.max(1, Math.ceil((def.maxZ - def.minZ) / this.cellSize - 1e-9));
    const n = this.cols * this.rows;
    this.base = new Uint8Array(n);
    this.walk = new Uint8Array(n);
    this.clear = new Float32Array(n);
    this.comp = new Int32Array(n);
    this.stack = new Int32Array(n);
    const padded = (this.cols + 2) * (this.rows + 2);
    const longest = Math.max(this.cols, this.rows) + 2;
    this.edtF = new Float64Array(padded);
    this.edtD = new Float64Array(longest);
    this.edtOut = new Float64Array(longest);
    this.edtV = new Int32Array(longest);
    this.edtZ = new Float64Array(longest + 1);
    for (const r of def.walkable) this.paint(r, this.base, 1);
    for (const r of def.blocked ?? []) this.paint(r, this.base, 0);
    for (const [id, rects] of Object.entries(def.blockers ?? {})) this.blockers.set(id, { rects, closed: false });
    this.rebuild();
  }

  /** True when the point is inside the bounds and within the vertical band of the floor. */
  contains(at: Vec3): boolean {
    return (
      at.x >= this.minX && at.x < this.maxX && at.z >= this.minZ && at.z < this.maxZ && Math.abs(at.y - this.floorY) <= this.band
    );
  }

  /** Cell index of a world point, or -1 outside the grid. */
  cellIndex(x: number, z: number): number {
    const ix = Math.floor((x - this.minX) / this.cellSize);
    const iz = Math.floor((z - this.minZ) / this.cellSize);
    if (!(ix >= 0 && ix < this.cols && iz >= 0 && iz < this.rows)) return -1;
    return iz * this.cols + ix;
  }

  /** World centre of a cell (at floorY). */
  cellCentre(i: number, out: Vec3 = { x: 0, y: 0, z: 0 }): Vec3 {
    const ix = i % this.cols;
    const iz = (i - ix) / this.cols;
    out.x = this.minX + (ix + 0.5) * this.cellSize;
    out.y = this.floorY;
    out.z = this.minZ + (iz + 0.5) * this.cellSize;
    return out;
  }

  isWalkable(i: number): boolean {
    return i >= 0 && i < this.walk.length && this.walk[i] === 1;
  }

  /** Metres between the cell centre and the nearest non-walkable cell's edge; 0 for non-walkable cells. */
  clearance(i: number): number {
    return i >= 0 && i < this.clear.length ? this.clear[i]! : 0;
  }

  /** Connected-component id (8-connected, no corner cutting), or -1 for non-walkable cells. */
  component(i: number): number {
    return i >= 0 && i < this.comp.length ? this.comp[i]! : -1;
  }

  /** Opens or closes a named blocker; false for an unknown id. */
  setBlocker(id: string, closed: boolean): boolean {
    const b = this.blockers.get(id);
    if (!b) return false;
    if (b.closed !== closed) {
      b.closed = closed;
      this.rebuild();
    }
    return true;
  }

  hasBlocker(id: string): boolean {
    return this.blockers.has(id);
  }

  /** Sets `value` on every cell whose centre is inside the rect. */
  private paint(r: NavRect, into: Uint8Array, value: number): void {
    const cs = this.cellSize;
    const ix0 = Math.max(0, Math.floor((r.x0 - this.minX) / cs) - 1);
    const ix1 = Math.min(this.cols - 1, Math.ceil((r.x1 - this.minX) / cs) + 1);
    const iz0 = Math.max(0, Math.floor((r.z0 - this.minZ) / cs) - 1);
    const iz1 = Math.min(this.rows - 1, Math.ceil((r.z1 - this.minZ) / cs) + 1);
    for (let iz = iz0; iz <= iz1; iz++) {
      const cz = this.minZ + (iz + 0.5) * cs;
      if (!(cz >= r.z0 && cz < r.z1)) continue;
      for (let ix = ix0; ix <= ix1; ix++) {
        const cx = this.minX + (ix + 0.5) * cs;
        if (cx >= r.x0 && cx < r.x1) into[iz * this.cols + ix] = value;
      }
    }
  }

  private rebuild(): void {
    this.walk.set(this.base);
    for (const b of this.blockers.values()) if (b.closed) for (const r of b.rects) this.paint(r, this.walk, 0);
    this.computeClearance();
    this.computeComponents();
  }

  /** Exact squared Euclidean distance transform (Felzenszwalb) over the grid padded by one non-walkable ring. */
  private computeClearance(): void {
    const W = this.cols + 2;
    const H = this.rows + 2;
    const INF = 1e9;
    const f = this.edtF;
    f.fill(0);
    for (let iz = 0; iz < this.rows; iz++) {
      for (let ix = 0; ix < this.cols; ix++) {
        f[(iz + 1) * W + ix + 1] = this.walk[iz * this.cols + ix] ? INF : 0;
      }
    }
    const d = this.edtD;
    // The lower envelope reads d[p] for p < q, so results go to a separate buffer (writing over d breaks exactness).
    const out = this.edtOut;
    const v = this.edtV;
    const z = this.edtZ;
    const pass = (len: number): void => {
      let k = 0;
      v[0] = 0;
      z[0] = -INF;
      z[1] = INF;
      for (let q = 1; q < len; q++) {
        let s: number;
        do {
          const p = v[k]!;
          s = (d[q]! + q * q - (d[p]! + p * p)) / (2 * q - 2 * p);
        } while (s <= z[k]! && k-- > 0);
        k++;
        v[k] = q;
        z[k] = s;
        z[k + 1] = INF;
      }
      k = 0;
      for (let q = 0; q < len; q++) {
        while (z[k + 1]! < q) k++;
        const p = v[k]!;
        out[q] = (q - p) * (q - p) + d[p]!;
      }
    };
    for (let x = 0; x < W; x++) {
      for (let y = 0; y < H; y++) d[y] = f[y * W + x]!;
      pass(H);
      for (let y = 0; y < H; y++) f[y * W + x] = out[y]!;
    }
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) d[x] = f[y * W + x]!;
      pass(W);
      for (let x = 0; x < W; x++) f[y * W + x] = out[x]!;
    }
    const half = this.cellSize / 2;
    for (let iz = 0; iz < this.rows; iz++) {
      for (let ix = 0; ix < this.cols; ix++) {
        const i = iz * this.cols + ix;
        this.clear[i] = this.walk[i] ? Math.max(0, Math.sqrt(f[(iz + 1) * W + ix + 1]!) * this.cellSize - half) : 0;
      }
    }
  }

  private computeComponents(): void {
    const { cols, rows, walk, comp, stack } = this;
    comp.fill(-1);
    let next = 0;
    for (let s = 0; s < walk.length; s++) {
      if (!walk[s] || comp[s] !== -1) continue;
      let sp = 0;
      stack[sp++] = s;
      comp[s] = next;
      while (sp > 0) {
        const i = stack[--sp]!;
        const ix = i % cols;
        const iz = (i - ix) / cols;
        for (let dz = -1; dz <= 1; dz++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dz === 0) continue;
            const nx = ix + dx;
            const nz = iz + dz;
            if (nx < 0 || nz < 0 || nx >= cols || nz >= rows) continue;
            const j = nz * cols + nx;
            if (!walk[j] || comp[j] !== -1) continue;
            if (dx !== 0 && dz !== 0 && (!walk[iz * cols + nx] || !walk[nz * cols + ix])) continue;
            comp[j] = next;
            stack[sp++] = j;
          }
        }
      }
      next++;
    }
  }
}
