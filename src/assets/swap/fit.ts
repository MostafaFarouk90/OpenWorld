// Pure fit maths for the asset swap: how a model's measured bounds are scaled and placed to fill a greybox's collider
// box, and how a footprint too big for one model is cut into module cells. No THREE objects, so tests need no renderer.

export interface Bounds {
  min: { x: number; y: number; z: number };
  max: { x: number; y: number; z: number };
}

/** The collider box to fill, in metres (width along local x, depth along local z). */
export interface FitTarget {
  width: number;
  depth: number;
  /** Omit to keep the uniform scale in height. */
  height?: number;
}

export interface FitPolicy {
  /** Largest allowed deviation of the x and z scale from the uniform scale (0.18 = +-18%). Default 0.18. */
  maxStretch?: number;
  /** Same for y; walls and towers pass a larger value. Default `maxStretch`. */
  maxHeightStretch?: number;
  /** Upper bound of the uniform scale (keeps doors from growing past about 1.7x the Knight). Default Infinity. */
  maxScale?: number;
  /** `base` puts the lowest point on y 0 (default); `keep` leaves the authored y (bridges that reach below their pivot). */
  pivot?: 'base' | 'keep';
}

export interface Fit {
  sx: number;
  sy: number;
  sz: number;
  /** Translation applied after scaling so the footprint centre sits on x 0, z 0 and the base on y 0. */
  offset: { x: number; y: number; z: number };
  /** True when the model could not fill the box within the policy (it is smaller or larger than the box on some axis). */
  clamped: boolean;
}

export const DEFAULT_MAX_STRETCH = 0.18;

const size = (b: Bounds) => ({ x: b.max.x - b.min.x, y: b.max.y - b.min.y, z: b.max.z - b.min.z });

/** @throws RangeError when the bounds or target have a non-positive or non-finite dimension. */
export function fitToBox(bounds: Bounds, target: FitTarget, policy: FitPolicy = {}): Fit {
  const s = size(bounds);
  const dims = [s.x, s.y, s.z, target.width, target.depth];
  if (target.height !== undefined) dims.push(target.height);
  if (dims.some((d) => !(d > 0) || !Number.isFinite(d))) {
    throw new RangeError(`fitToBox: bad dimensions ${JSON.stringify({ size: s, target })}`);
  }
  const m = policy.maxStretch ?? DEFAULT_MAX_STRETCH;
  const mh = policy.maxHeightStretch ?? m;
  const wantX = target.width / s.x;
  const wantZ = target.depth / s.z;
  let u = Math.sqrt(wantX * wantZ);
  let clamped = false;
  const cap = policy.maxScale ?? Infinity;
  if (u > cap) {
    u = cap;
    clamped = true;
  }
  const lim = (want: number, stretch: number): number => {
    const lo = u * (1 - stretch);
    const hi = u * (1 + stretch);
    const v = Math.min(hi, Math.max(lo, want));
    if (v !== want) clamped = true;
    return v;
  };
  const sx = lim(wantX, m);
  const sz = lim(wantZ, m);
  const sy = target.height === undefined ? u : lim(target.height / s.y, mh);
  const cx = (bounds.min.x + bounds.max.x) / 2;
  const cz = (bounds.min.z + bounds.max.z) / 2;
  return {
    sx,
    sy,
    sz,
    offset: { x: -cx * sx, y: policy.pivot === 'keep' ? 0 : -bounds.min.y * sy, z: -cz * sz },
    clamped,
  };
}

export interface Cell {
  /** Centre relative to the footprint centre. */
  cx: number;
  cz: number;
  w: number;
  d: number;
}

/**
 * Cuts a footprint into a grid of cells about `pitch` metres across (at least one). With `perimeterOnly`, a grid of three or more
 * columns and rows keeps only its outer ring, since the middle cells are never seen from outside.
 */
export function tile(width: number, depth: number, pitch: number, perimeterOnly = false): Cell[] {
  if (!(width > 0) || !(depth > 0) || !(pitch > 0)) throw new RangeError(`tile: bad size ${width}x${depth} pitch ${pitch}`);
  const cols = Math.max(1, Math.round(width / pitch));
  const rows = Math.max(1, Math.round(depth / pitch));
  const w = width / cols;
  const d = depth / rows;
  const cells: Cell[] = [];
  for (let i = 0; i < cols; i++) {
    for (let j = 0; j < rows; j++) {
      if (perimeterOnly && cols >= 3 && rows >= 3 && i > 0 && i < cols - 1 && j > 0 && j < rows - 1) continue;
      cells.push({ cx: -width / 2 + w * (i + 0.5), cz: -depth / 2 + d * (j + 0.5), w, d });
    }
  }
  return cells;
}

/** Cells along one axis for a wall run: `length` split into pieces about `pitch` long. */
export function tileLine(length: number, pitch: number): { c: number; len: number }[] {
  return tile(length, 1, pitch).map((c) => ({ c: c.cx, len: c.w }));
}

/** Deterministic pick from `n` choices for a structure id (a stable look across loads and saves). */
export function hashPick(id: string, n: number): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) % n;
}
