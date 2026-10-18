// Pure map model: transforms, fog of discovery, markers, selection and hit testing.
// No engine, DOM or canvas dependencies.

import { DEFAULT_WORLD_BOUNDS, MAP_TUNING, type WorldBounds } from './tuning';

export type { WorldBounds } from './tuning';

export interface Vec2 {
  x: number;
  z: number;
}

export interface MapPoint {
  u: number;
  v: number;
}

// ---------------------------------------------------------------- transforms
// Map space: u grows with world x (east), v grows with world z (screen down).
// `size` is the pixel length of the map's LONGER edge; the shorter edge scales by the same factor so
// non-square bounds are never stretched (one metre is the same number of pixels on both axes).

export function boundsWidth(b: WorldBounds): number {
  return b.maxX - b.minX;
}
export function boundsDepth(b: WorldBounds): number {
  return b.maxZ - b.minZ;
}

/** Pixels per metre when the longer bounds edge is `size` pixels. */
export function mapScale(bounds: WorldBounds, size: number): number {
  return size / Math.max(boundsWidth(bounds), boundsDepth(bounds));
}

/** Pixel extent of the whole map (width along x, height along z). */
export function mapExtent(bounds: WorldBounds, size: number): { width: number; height: number } {
  const s = mapScale(bounds, size);
  return { width: Math.max(1, Math.round(boundsWidth(bounds) * s)), height: Math.max(1, Math.round(boundsDepth(bounds) * s)) };
}

/** Does not clamp: a point outside the bounds lands outside [0, extent]. */
export function worldToMap(x: number, z: number, bounds: WorldBounds, size: number): MapPoint {
  const s = mapScale(bounds, size);
  return { u: (x - bounds.minX) * s, v: (z - bounds.minZ) * s };
}

export function mapToWorld(u: number, v: number, bounds: WorldBounds, size: number): Vec2 {
  const s = mapScale(bounds, size);
  return { x: bounds.minX + u / s, z: bounds.minZ + v / s };
}

export function inBounds(x: number, z: number, bounds: WorldBounds): boolean {
  return x >= bounds.minX && x <= bounds.maxX && z >= bounds.minZ && z <= bounds.maxZ;
}

export interface ClampResult extends Vec2 {
  /** True when the input was outside the bounds and was moved. */
  clamped: boolean;
}

/** Clamp a world point to the bounds (per axis). Non-finite input collapses to the centre. */
export function clampToBounds(x: number, z: number, bounds: WorldBounds): ClampResult {
  const cx = (bounds.minX + bounds.maxX) / 2;
  const cz = (bounds.minZ + bounds.maxZ) / 2;
  const sx = Number.isFinite(x) ? x : cx;
  const sz = Number.isFinite(z) ? z : cz;
  const nx = Math.min(Math.max(sx, bounds.minX), bounds.maxX);
  const nz = Math.min(Math.max(sz, bounds.minZ), bounds.maxZ);
  return { x: nx, z: nz, clamped: nx !== x || nz !== z };
}

export interface ArrowPlacement extends MapPoint {
  clamped: boolean;
}

/**
 * Player arrow position in map pixels. A player outside the world sits on the map edge, moved along
 * the line towards the centre so the arrow still points the right way.
 */
export function playerArrowPosition(x: number, z: number, bounds: WorldBounds, size: number): ArrowPlacement {
  const c = clampToBounds(x, z, bounds);
  const p = worldToMap(c.x, c.z, bounds, size);
  return { u: p.u, v: p.v, clamped: c.clamped };
}

// ---------------------------------------------------------------- fog grid

const FOG_MAGIC = 0x46; // 'F'
const FOG_FORMAT = 1;
const HEADER_BYTES = 1 + 1 + 8 + 8 + 4 + 4 + 4; // magic, format, originX, originZ, cell, cols, rows

export interface FogGridSpec {
  originX: number;
  originZ: number;
  cellSize: number;
  cols: number;
  rows: number;
}

export class FogGrid {
  readonly originX: number;
  readonly originZ: number;
  readonly cellSize: number;
  readonly cols: number;
  readonly rows: number;
  private readonly bits: Uint8Array;
  private count = 0;

  constructor(spec: FogGridSpec) {
    if (!(spec.cellSize > 0) || !Number.isFinite(spec.cellSize)) throw new RangeError('cellSize must be > 0');
    if (!Number.isInteger(spec.cols) || !Number.isInteger(spec.rows) || spec.cols < 1 || spec.rows < 1) {
      throw new RangeError('cols and rows must be positive integers');
    }
    this.originX = spec.originX;
    this.originZ = spec.originZ;
    this.cellSize = spec.cellSize;
    this.cols = spec.cols;
    this.rows = spec.rows;
    this.bits = new Uint8Array(Math.ceil((spec.cols * spec.rows) / 8));
  }

  static forBounds(
    bounds: WorldBounds = DEFAULT_WORLD_BOUNDS,
    cellSize: number = MAP_TUNING.fogCellSize,
  ): FogGrid {
    return new FogGrid({
      originX: bounds.minX,
      originZ: bounds.minZ,
      cellSize,
      cols: Math.max(1, Math.ceil(boundsWidth(bounds) / cellSize)),
      rows: Math.max(1, Math.ceil(boundsDepth(bounds) / cellSize)),
    });
  }

  get spec(): FogGridSpec {
    return { originX: this.originX, originZ: this.originZ, cellSize: this.cellSize, cols: this.cols, rows: this.rows };
  }

  /** Number of revealed cells. */
  get revealedCount(): number {
    return this.count;
  }

  private get(i: number): boolean {
    return (this.bits[i >> 3]! & (1 << (i & 7))) !== 0;
  }

  /** Cell index containing world point, or -1 when outside the grid. */
  cellIndexAt(x: number, z: number): number {
    const c = Math.floor((x - this.originX) / this.cellSize);
    const r = Math.floor((z - this.originZ) / this.cellSize);
    if (!(c >= 0 && c < this.cols && r >= 0 && r < this.rows)) return -1;
    return r * this.cols + c;
  }

  isRevealed(x: number, z: number): boolean {
    const i = this.cellIndexAt(x, z);
    return i >= 0 && this.get(i);
  }

  isCellRevealed(col: number, row: number): boolean {
    if (col < 0 || col >= this.cols || row < 0 || row >= this.rows) return false;
    return this.get(row * this.cols + col);
  }

  /** World centre of a cell. */
  cellCenter(col: number, row: number): Vec2 {
    return { x: this.originX + (col + 0.5) * this.cellSize, z: this.originZ + (row + 0.5) * this.cellSize };
  }

  /**
   * Reveal every cell whose centre lies within `radius` (inclusive) of (x, z).
   * Idempotent. Returns the number of newly revealed cells. Non-finite input reveals nothing.
   */
  reveal(x: number, z: number, radius: number): number {
    if (!Number.isFinite(x) || !Number.isFinite(z) || !Number.isFinite(radius) || radius < 0) return 0;
    const cs = this.cellSize;
    const c0 = Math.max(0, Math.floor((x - radius - this.originX) / cs - 0.5));
    const c1 = Math.min(this.cols - 1, Math.ceil((x + radius - this.originX) / cs - 0.5));
    const r0 = Math.max(0, Math.floor((z - radius - this.originZ) / cs - 0.5));
    const r1 = Math.min(this.rows - 1, Math.ceil((z + radius - this.originZ) / cs - 0.5));
    const r2 = radius * radius;
    let added = 0;
    for (let r = r0; r <= r1; r++) {
      const dz = this.originZ + (r + 0.5) * cs - z;
      for (let c = c0; c <= c1; c++) {
        const dx = this.originX + (c + 0.5) * cs - x;
        if (dx * dx + dz * dz > r2) continue;
        const i = r * this.cols + c;
        const mask = 1 << (i & 7);
        if ((this.bits[i >> 3]! & mask) === 0) {
          this.bits[i >> 3] = this.bits[i >> 3]! | mask;
          added++;
        }
      }
    }
    this.count += added;
    return added;
  }

  clear(): void {
    this.bits.fill(0);
    this.count = 0;
  }

  /**
   * Compact base64: a header (origin, cell size, dimensions) followed by the bitset with runs of
   * zero bytes run-length encoded (0x00 followed by a varint run length). An 11.5 km x 6.5 km world at
   * 50 m cells is 250 x 130 bits = 4 KB raw and a few hundred bytes when sparsely explored.
   */
  encode(): string {
    const out: number[] = [];
    const head = new DataView(new ArrayBuffer(HEADER_BYTES));
    head.setUint8(0, FOG_MAGIC);
    head.setUint8(1, FOG_FORMAT);
    head.setFloat64(2, this.originX);
    head.setFloat64(10, this.originZ);
    head.setFloat32(18, this.cellSize);
    head.setUint32(22, this.cols);
    head.setUint32(26, this.rows);
    for (let i = 0; i < HEADER_BYTES; i++) out.push(head.getUint8(i));
    const b = this.bits;
    for (let i = 0; i < b.length; ) {
      if (b[i] !== 0) {
        out.push(b[i]!);
        i++;
        continue;
      }
      let run = 0;
      while (i < b.length && b[i] === 0) {
        run++;
        i++;
      }
      out.push(0);
      let n = run;
      while (n >= 0x80) {
        out.push((n & 0x7f) | 0x80);
        n >>>= 7;
      }
      out.push(n);
    }
    return bytesToBase64(Uint8Array.from(out));
  }

  /**
   * Decode a saved grid of any extent into `expected`, copying each revealed cell to the cell that covers
   * the same world position. Works for equal headers too. A header that cannot be read (corrupt, short,
   * other cell size or a non-cell-aligned origin) gives an empty grid of the expected shape; never throws.
   * An old grid that is a different shape never wipes cells that still fit in the new one.
   */
  static migrate(encoded: unknown, expected: FogGridSpec): FogGrid {
    const empty = new FogGrid(expected);
    if (typeof encoded !== 'string' || encoded.length === 0) return empty;
    const bytes = base64ToBytes(encoded);
    if (!bytes || bytes.length < HEADER_BYTES) return empty;
    const head = new DataView(bytes.buffer, bytes.byteOffset, HEADER_BYTES);
    if (head.getUint8(0) !== FOG_MAGIC || head.getUint8(1) !== FOG_FORMAT) return empty;
    const old: FogGridSpec = {
      originX: head.getFloat64(2),
      originZ: head.getFloat64(10),
      cellSize: head.getFloat32(18),
      cols: head.getUint32(22),
      rows: head.getUint32(26),
    };
    if (!Number.isFinite(old.originX) || !Number.isFinite(old.originZ)) return empty;
    if (old.cols < 1 || old.rows < 1 || old.cols * old.rows > 4_000_000) return empty;
    if (old.cellSize !== Math.fround(expected.cellSize)) return empty;
    const dc = (old.originX - expected.originX) / expected.cellSize;
    const dr = (old.originZ - expected.originZ) / expected.cellSize;
    if (!Number.isInteger(dc) || !Number.isInteger(dr)) return empty;
    let src: FogGrid;
    try {
      src = FogGrid.decode(encoded, { ...old, cellSize: expected.cellSize });
    } catch {
      return empty;
    }
    if (src.revealedCount === 0) return empty;
    for (let r = 0; r < src.rows; r++) {
      const nr = r + dr;
      if (nr < 0 || nr >= expected.rows) continue;
      for (let c = 0; c < src.cols; c++) {
        const nc = c + dc;
        if (nc < 0 || nc >= expected.cols || !src.isCellRevealed(c, r)) continue;
        const i = nr * expected.cols + nc;
        empty.bits[i >> 3] = empty.bits[i >> 3]! | (1 << (i & 7));
        empty.count++;
      }
    }
    return empty;
  }

  /**
   * Decode into a grid matching `expected`. Returns an empty grid of the expected shape on corrupt
   * input or when origin, cell size or dimensions differ (the world changed).
   */
  static decode(encoded: unknown, expected: FogGridSpec): FogGrid {
    const empty = new FogGrid(expected);
    if (typeof encoded !== 'string' || encoded.length === 0) return empty;
    const bytes = base64ToBytes(encoded);
    if (!bytes || bytes.length < HEADER_BYTES) return empty;
    const head = new DataView(bytes.buffer, bytes.byteOffset, HEADER_BYTES);
    if (head.getUint8(0) !== FOG_MAGIC || head.getUint8(1) !== FOG_FORMAT) return empty;
    if (
      head.getFloat64(2) !== expected.originX ||
      head.getFloat64(10) !== expected.originZ ||
      head.getFloat32(18) !== Math.fround(expected.cellSize) ||
      head.getUint32(22) !== expected.cols ||
      head.getUint32(26) !== expected.rows
    ) {
      return empty;
    }
    const target = empty.bits;
    let pos = HEADER_BYTES;
    let w = 0;
    while (pos < bytes.length) {
      const v = bytes[pos++]!;
      if (v !== 0) {
        if (w >= target.length) return new FogGrid(expected);
        target[w++] = v;
        continue;
      }
      let run = 0;
      let shift = 0;
      for (;;) {
        if (pos >= bytes.length || shift > 28) return new FogGrid(expected);
        const t = bytes[pos++]!;
        run += (t & 0x7f) * 2 ** shift;
        shift += 7;
        if ((t & 0x80) === 0) break;
      }
      if (run < 1 || w + run > target.length) return new FogGrid(expected);
      w += run; // target is already zeroed
    }
    if (w !== target.length) return new FogGrid(expected);
    // Trailing bits beyond cols*rows must be clear.
    const total = expected.cols * expected.rows;
    const rem = total & 7;
    if (rem !== 0 && (target[target.length - 1]! >> rem) !== 0) return new FogGrid(expected);
    let count = 0;
    for (let i = 0; i < target.length; i++) count += popcount8(target[i]!);
    empty.count = count;
    return empty;
  }
}

function popcount8(v: number): number {
  let n = 0;
  for (let x = v; x; x &= x - 1) n++;
  return n;
}

function bytesToBase64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(s);
}

function base64ToBytes(s: string): Uint8Array | null {
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(s) || s.length % 4 !== 0) return null;
  try {
    const bin = atob(s);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------- markers

export type WaystoneState = 'dormant' | 'rekindled';
export type MarkerKind = 'waystone' | 'poi' | 'quest' | 'shrine' | 'fog';

export interface WaystoneInput {
  id: string;
  x: number;
  z: number;
  state: WaystoneState;
  discovered: boolean;
  label?: string;
}
export interface PoiInput {
  id: string;
  x: number;
  z: number;
  label?: string;
}
export interface QuestInput {
  id: string;
  x: number;
  z: number;
  label?: string;
}

export interface MapMarker {
  id: string;
  kind: MarkerKind;
  x: number;
  z: number;
  label: string;
  /** Waystones only. */
  state?: WaystoneState;
  /** True when a click may fast travel here (rekindled waystones). */
  travelable: boolean;
}

export interface BuildMarkersInput {
  waystones: readonly WaystoneInput[];
  poi?: readonly PoiInput[];
  /** One quest marker, or several (offer leads). All use the 'quest' kind. */
  quest?: QuestInput | readonly QuestInput[] | null;
  /** Rekindled shrines with a known position. */
  shrines?: readonly PoiInput[];
  /** The fog wall marker; pass null once the wall is gone. */
  fog?: PoiInput | null;
}

/** Build the marker list: waystones first, then points of interest, then the quest marker. */
export function buildMarkers(input: BuildMarkersInput): MapMarker[] {
  const out: MapMarker[] = [];
  for (const w of input.waystones) {
    if (!isFinitePos(w.x, w.z)) continue;
    if (w.state === 'dormant' && !w.discovered) continue;
    out.push({
      id: w.id,
      kind: 'waystone',
      x: w.x,
      z: w.z,
      label: w.label ?? w.id,
      state: w.state,
      travelable: w.state === 'rekindled',
    });
  }
  for (const p of input.poi ?? []) {
    if (!isFinitePos(p.x, p.z)) continue;
    out.push({ id: p.id, kind: 'poi', x: p.x, z: p.z, label: p.label ?? p.id, travelable: false });
  }
  for (const p of input.shrines ?? []) {
    if (!isFinitePos(p.x, p.z)) continue;
    out.push({ id: p.id, kind: 'shrine', x: p.x, z: p.z, label: p.label ?? p.id, travelable: false });
  }
  const f = input.fog;
  if (f && isFinitePos(f.x, f.z)) {
    out.push({ id: f.id, kind: 'fog', x: f.x, z: f.z, label: f.label ?? f.id, travelable: false });
  }
  const qs = input.quest ? (Array.isArray(input.quest) ? input.quest : [input.quest]) : [];
  for (const q of qs as readonly QuestInput[]) {
    if (!isFinitePos(q.x, q.z)) continue;
    out.push({ id: q.id, kind: 'quest', x: q.x, z: q.z, label: q.label ?? q.id, travelable: false });
  }
  return out;
}

function isFinitePos(x: number, z: number): boolean {
  return Number.isFinite(x) && Number.isFinite(z);
}

/** Nearest marker to a world point (optionally within maxDistance), or null. */
export function nearestMarker(
  markers: readonly MapMarker[],
  x: number,
  z: number,
  maxDistance = Infinity,
): MapMarker | null {
  let best: MapMarker | null = null;
  let bestD = maxDistance * maxDistance;
  for (const m of markers) {
    const d = (m.x - x) ** 2 + (m.z - z) ** 2;
    if (d <= bestD) {
      best = m;
      bestD = d;
    }
  }
  return best;
}

/**
 * Keyboard selection order: markers sorted by distance from (originX, originZ) (the player), ties
 * broken by id, so Tab walks outward from the player. Returns a new array.
 */
export function selectionOrder(markers: readonly MapMarker[], originX: number, originZ: number): MapMarker[] {
  return markers
    .map((m) => ({ m, d: (m.x - originX) ** 2 + (m.z - originZ) ** 2 }))
    .sort((a, b) => a.d - b.d || (a.m.id < b.m.id ? -1 : a.m.id > b.m.id ? 1 : 0))
    .map((e) => e.m);
}

/**
 * Next (dir = 1) or previous (dir = -1) marker id from `currentId` in `ordered`, wrapping.
 * With nothing selected (or an id no longer present) next picks the first, previous the last.
 * Returns null when there are no markers.
 */
export function stepSelection(ordered: readonly MapMarker[], currentId: string | null, dir: 1 | -1): string | null {
  const n = ordered.length;
  if (n === 0) return null;
  const idx = currentId === null ? -1 : ordered.findIndex((m) => m.id === currentId);
  if (idx < 0) return (dir === 1 ? ordered[0]! : ordered[n - 1]!).id;
  return ordered[(idx + dir + n) % n]!.id;
}

/**
 * Hit test a click at map pixel (u, v). Returns the nearest marker within `radiusPx`
 * (earlier markers win ties), or null.
 */
export function hitTestMarker(
  markers: readonly MapMarker[],
  u: number,
  v: number,
  bounds: WorldBounds,
  size: number,
  radiusPx: number = MAP_TUNING.markerHitRadiusPx,
): MapMarker | null {
  let best: MapMarker | null = null;
  let bestD = radiusPx * radiusPx;
  for (const m of markers) {
    const p = worldToMap(m.x, m.z, bounds, size);
    const d = (p.u - u) ** 2 + (p.v - v) ** 2;
    if (d <= bestD && (best === null || d < bestD)) {
      best = m;
      bestD = d;
    }
  }
  return best;
}
