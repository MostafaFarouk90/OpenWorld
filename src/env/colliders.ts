// Env colliders (follow-up round 2, item 2): the cosmetic scenery that is solid, as simple oriented boxes. Pure: no Three, no Rapier
// (src/env/colliderStreamer.ts turns the boxes into static cuboids around the player).
//
// What collides (coordinator rulings 2026-10-31): fence, wall and hedge runs (consecutive modules merge into one box, never a box per
// module), the carts, hearths, clamps, slag heaps, chimney and braziers, the market stalls' table front only, and trees (trunk r 0.3) in
// the B tiles only. Barrels, crates, ore piles, coal heaps, haystacks, outbuildings and litter do not collide. Rows with `dy` (roof decks)
// never collide. D tiles come later.
//
// Keep-walkable rule: a box that touches a crowd lane (its half width), a chase corridor (1.5 m each side), a trigger shape, an anchor
// (r 1.2) or a door arrival point (r 2) is dropped, not the path. The check runs per module before runs merge, so a dropped module
// leaves a real gap (a gate) and the runs on either side stay apart.
import { classOf, rowLift, type PlacementRow } from './PlacementField';

/** An oriented ground box. Local x runs along (cos yaw, -sin yaw), the same convention as Three's rotation about Y and Rapier's quaternion. */
export interface ColliderBox {
  cx: number;
  cz: number;
  /** Half extents along local x and local z (metres). */
  hx: number;
  hz: number;
  /** Height above the ground (metres, at least MIN_HEIGHT). */
  h: number;
  /** Radians. */
  yaw: number;
  kind: 'run' | 'box' | 'trunk';
  /** The id of the first module (a run keeps the id of its family). */
  id: string;
  /** Modules merged into this box (1 for a single). */
  modules: number;
}

/** Nothing is left a low trip that the controller's auto-step would half climb. */
export const MIN_HEIGHT = 1.0;
/** Two modules join a run when their centres are at most this many module lengths apart. */
export const RUN_GAP = 1.1;
/** Modules whose centre lines differ by less than this (metres) are collinear. */
export const RUN_LATERAL = 0.3;
/** A merged run is cut into pieces of at most this length so the 64 m streaming cells keep every piece near its own cell. */
export const MAX_RUN_PIECE = 32;
/** Trunk half extent (a square of 0.6 m, r 0.3) and height. */
export const TRUNK_HALF = 0.3;
export const TRUNK_HEIGHT = 3;

interface RunShape {
  kind: 'run';
  /** Module length (m, along local x) and thickness (m). */
  len: number;
  thick: number;
  h: number;
}
interface BoxShape {
  kind: 'box';
  w: number;
  d: number;
  h: number;
  /** Table front only: the box is this deep and sits against the model's front (+Z local), the awning area stays walkable. */
  front?: number;
}
type Shape = RunShape | BoxShape;

const run = (len: number, thick: number, h: number): RunShape => ({ kind: 'run', len, thick, h });
// Footprints are fractions of the targets in targets.json: carts 0.9 x 0.8, hearths and heaps 0.85, the rest the target size.
const box = (w: number, d: number, h: number, fw = 1, fd = fw): BoxShape => ({ kind: 'box', w: w * fw, d: d * fd, h });

/**
 * The shape table. Module lengths of the KayKit-backed walls come from the row spacing in the tiles (stonewall-high 6.25, the lane-gate wing
 * 4.25, fence_stone_straight 6.4, fence 3.15); the rest are the targets. The slag-heap, mine-cart, ore-pile and smelter-chimney footprints are
 * the round 1 stand-in sizes (targets.json). A `-ashen` suffix shares its base id's shape.
 */
export const SHAPES: Readonly<Record<string, Shape>> = {
  'wattle-fence': run(3.4, 0.4, 1.4),
  'picket-fence': run(3.4, 0.35, 1.4),
  'scorched-fence': run(3.4, 0.4, 1.6),
  'stonewall-low': run(3.4, 0.7, 1.2),
  'stonewall-wing': run(4.25, 0.7, 1.2),
  'stonewall-high': run(6.25, 0.7, 1.8),
  fence: run(3.15, 0.4, 1.4),
  fence_stone_straight: run(6.4, 0.7, 1.4),
  'hedge-straight': run(3.4, 0.8, 1.6),
  'hedge-corner': box(1.2, 1.2, 1.6),
  'handcart-a': box(2.2, 1.2, 1.0, 0.9, 0.8),
  'cart-goods-a': box(3.4, 1.7, 1.9, 0.9, 0.8),
  'haycart-a': box(3.2, 1.6, 1.8, 0.9, 0.8),
  'mine-cart': box(1.8, 1.0, 1.0, 0.9, 0.8),
  'wagon-burnt': box(4, 2, 2, 0.9, 0.8),
  'wagon-wreck-a': box(4, 2, 2.2, 0.9, 0.8),
  'forge-hearth-a': box(2.4, 1.8, 1.6, 0.85),
  'charcoal-clamp-a': box(4, 4, 2, 0.85),
  'slag-heap': box(5, 5, 2.5, 0.85),
  'smelter-chimney': box(2, 2, 9, 0.9),
  'anvil-a': box(0.9, 0.4, 0.9),
  'brazier-standing-a': box(0.7, 0.7, 1.4),
  // Table front only: the full width, a 0.45 m band against the front; the awning area behind it stays walkable.
  'market-stall-a': { kind: 'box', w: 3, d: 2.4, h: 1.0, front: 0.45 },
  'market-stall-b': { kind: 'box', w: 3, d: 2.4, h: 1.0, front: 0.45 },
  // The Caldera (Act 5 N1 PR 2, tile c1): the gates' wall modules run, the big pieces are boxes. Lanterns, banners, racks, shards, nests,
  // ribs, the Lava Stair's basalt columns (B4's shrine shares the id and has none) and the door portals do not collide.
  'rim-wall-a': run(6, 1.6, 4),
  'foundry-wall-a': run(6, 2, 5),
  'basalt-boulder-a': box(3.2, 2.6, 2, 0.8),
  'warhost-tent-a': box(5, 6, 3.2, 0.9),
  'wyrm-skull-a': box(4, 5.5, 2.6, 0.8),
  'forge-gong-frame-a': box(4.2, 1.2, 4.6, 0.9, 0.6),
};

/** Ids that look solid but deliberately do not collide (rulings): listed so a test can pin them. */
export const NO_COLLIDER: ReadonlySet<string> = new Set(['barrel', 'crate_A_small', 'crate_A_big', 'crate_long_A', 'crate_open', 'crates-stacked-a', 'ore-pile', 'coal-heap-a', 'keg-a']);

const baseId = (id: string): string => id.replace(/-ashen$/, '');
export const shapeFor = (id: string): Shape | undefined => SHAPES[baseId(id)];

/** Trees get a trunk collider in the B tiles only. */
export const isBTile = (tile: string): boolean => /^b\d/.test(tile);

// ---------------------------------------------------------------- keep-out

export interface KeepOutDisc {
  x: number;
  z: number;
  r: number;
  why: string;
}
export interface KeepOutSegment {
  ax: number;
  az: number;
  bx: number;
  bz: number;
  /** Half width: boxes closer than this to the segment are dropped. */
  r: number;
  why: string;
}
export interface KeepOutBox {
  cx: number;
  cz: number;
  hx: number;
  hz: number;
  /** Radians, same convention as ColliderBox. */
  yaw: number;
  why: string;
}
export interface KeepOut {
  discs: readonly KeepOutDisc[];
  segments: readonly KeepOutSegment[];
  boxes: readonly KeepOutBox[];
}
export const EMPTY_KEEP_OUT: KeepOut = { discs: [], segments: [], boxes: [] };

type Rect = Pick<ColliderBox, 'cx' | 'cz' | 'hx' | 'hz' | 'yaw'>;

const toLocal = (b: Rect, x: number, z: number): [number, number] => {
  const c = Math.cos(b.yaw);
  const s = Math.sin(b.yaw);
  const dx = x - b.cx;
  const dz = z - b.cz;
  return [dx * c - dz * s, dx * s + dz * c];
};

/** Distance from a point to the rectangle (0 inside). */
export function pointToRect(b: Rect, x: number, z: number): number {
  const [lx, lz] = toLocal(b, x, z);
  return Math.hypot(Math.max(Math.abs(lx) - b.hx, 0), Math.max(Math.abs(lz) - b.hz, 0));
}

/** Distance from a segment to the rectangle (0 when they touch), by stepping along the segment in 0.25 m (the distance is convex along it). */
export function segmentToRect(b: Rect, ax: number, az: number, bx: number, bz: number): number {
  const len = Math.hypot(bx - ax, bz - az);
  const steps = Math.min(4000, Math.max(1, Math.ceil(len / 0.25)));
  let best = Infinity;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const d = pointToRect(b, ax + (bx - ax) * t, az + (bz - az) * t);
    if (d < best) best = d;
    if (best === 0) break;
  }
  return best;
}

const corners = (b: Rect): Array<[number, number]> => {
  const c = Math.cos(b.yaw);
  const s = Math.sin(b.yaw);
  return ([[-b.hx, -b.hz], [b.hx, -b.hz], [b.hx, b.hz], [-b.hx, b.hz]] as Array<[number, number]>).map(([lx, lz]) => [b.cx + lx * c + lz * s, b.cz - lx * s + lz * c]);
};

/** Separating-axis overlap of two oriented rectangles (touching edges do not overlap). */
export function rectsOverlap(a: Rect, b: Rect): boolean {
  const ca = corners(a);
  const cb = corners(b);
  for (const r of [a, b]) {
    for (const [ax, az] of [[Math.cos(r.yaw), -Math.sin(r.yaw)], [Math.sin(r.yaw), Math.cos(r.yaw)]] as Array<[number, number]>) {
      const pa = ca.map(([x, z]) => x * ax + z * az);
      const pb = cb.map(([x, z]) => x * ax + z * az);
      if (Math.max(...pa) <= Math.min(...pb) + 1e-9 || Math.max(...pb) <= Math.min(...pa) + 1e-9) return false;
    }
  }
  return true;
}

/** Why a box must go (a short reason), or null when it keeps clear of every lane, chase corridor, trigger, anchor and door. */
export function keepOutHit(b: Rect, ko: KeepOut): string | null {
  const reach = Math.hypot(b.hx, b.hz);
  for (const d of ko.discs) {
    if (Math.abs(d.x - b.cx) > reach + d.r || Math.abs(d.z - b.cz) > reach + d.r) continue;
    if (pointToRect(b, d.x, d.z) < d.r) return d.why;
  }
  for (const s of ko.segments) {
    const pad = reach + s.r;
    if (Math.max(s.ax, s.bx) < b.cx - pad || Math.min(s.ax, s.bx) > b.cx + pad || Math.max(s.az, s.bz) < b.cz - pad || Math.min(s.az, s.bz) > b.cz + pad) continue;
    if (segmentToRect(b, s.ax, s.az, s.bx, s.bz) < s.r) return s.why;
  }
  for (const k of ko.boxes) {
    if (Math.abs(k.cx - b.cx) > reach + Math.hypot(k.hx, k.hz) || Math.abs(k.cz - b.cz) > reach + Math.hypot(k.hx, k.hz)) continue;
    if (rectsOverlap(b, k)) return k.why;
  }
  return null;
}

// ---------------------------------------------------------------- building

export interface ColliderStats {
  /** Rows read. */
  rows: number;
  /** Candidate modules (rows that have a shape). */
  modules: number;
  /** Modules dropped by the keep-walkable rule. */
  dropped: number;
  /** Dropped modules by reason (the keep-out entry's `why`, first word). */
  droppedBy: Record<string, number>;
  /** Rows skipped: on a roof deck (`dy`) or with bad numbers. */
  skipped: number;
  /** Boxes made (runs count once). */
  boxes: number;
  runs: number;
  /** Modules that went into runs. */
  runModules: number;
  singles: number;
  trunks: number;
}
export interface TileColliders {
  boxes: ColliderBox[];
  stats: ColliderStats;
}

export interface Module extends Rect {
  id: string;
  kind: ColliderBox['kind'];
  len: number;
  thick: number;
  h: number;
  scale: number;
}

const finite = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);
const DEG = Math.PI / 180;

function moduleFor(row: PlacementRow, tile: string): Module | null {
  const scale = finite(row.scale) && row.scale > 0 ? row.scale : 1;
  const yaw = (finite(row.yaw) ? row.yaw : 0) * DEG;
  if (classOf(row.id) === 'tree') {
    if (!isBTile(tile)) return null;
    return { cx: row.x, cz: row.z, hx: TRUNK_HALF, hz: TRUNK_HALF, yaw: 0, id: row.id, kind: 'trunk', len: 0, thick: 0, h: TRUNK_HEIGHT, scale };
  }
  const shape = shapeFor(row.id);
  if (!shape) return null;
  if (shape.kind === 'run') {
    // A line has no front: yaw and yaw + 180 are the same box, so fold to [0, 180) and runs of opposite-facing modules still join.
    const folded = (((yaw % Math.PI) + Math.PI) % Math.PI);
    return { cx: row.x, cz: row.z, hx: (shape.len * scale) / 2, hz: (shape.thick * scale) / 2, yaw: folded, id: baseId(row.id), kind: 'run', len: shape.len * scale, thick: shape.thick * scale, h: Math.max(MIN_HEIGHT, shape.h * scale), scale };
  }
  const w = shape.w * scale;
  const d = (shape.front ?? shape.d) * scale;
  let cx = row.x;
  let cz = row.z;
  if (shape.front) {
    // The model's front faces +Z local: the band sits against it, so the centre moves toward the front by (depth - band) / 2.
    const off = ((shape.d * scale) - d) / 2;
    cx += Math.sin(yaw) * off;
    cz += Math.cos(yaw) * off;
  }
  return { cx, cz, hx: w / 2, hz: d / 2, yaw, id: row.id, kind: 'box', len: 0, thick: 0, h: Math.max(MIN_HEIGHT, shape.h * scale), scale };
}

/** Merge collinear modules of one family into runs (pure; exported for the tests). `modules` all share a kind 'run'. */
export function mergeRuns(modules: readonly Module[]): ColliderBox[] {
  const groups = new Map<string, Module[]>();
  for (const m of modules) {
    const key = `${m.id}|${Math.round((m.yaw / DEG) * 2)}|${m.thick.toFixed(2)}|${m.h.toFixed(2)}|${m.len.toFixed(2)}`;
    (groups.get(key) ?? groups.set(key, []).get(key)!).push(m);
  }
  const out: ColliderBox[] = [];
  for (const g of groups.values()) {
    const yaw = g[0]!.yaw;
    const dx = Math.cos(yaw);
    const dz = -Math.sin(yaw);
    const nx = Math.sin(yaw);
    const nz = Math.cos(yaw);
    const lat = (m: Module): number => m.cx * nx + m.cz * nz;
    const along = (m: Module): number => m.cx * dx + m.cz * dz;
    const byLat = [...g].sort((a, b) => lat(a) - lat(b));
    // Centre lines: a chain of modules whose lateral offsets step by less than RUN_LATERAL.
    const lines: Module[][] = [];
    for (const m of byLat) {
      const line = lines[lines.length - 1];
      if (line && lat(m) - lat(line[line.length - 1]!) <= RUN_LATERAL) line.push(m);
      else lines.push([m]);
    }
    for (const line of lines) {
      line.sort((a, b) => along(a) - along(b));
      let piece: Module[] = [];
      const flush = (): void => {
        if (!piece.length) return;
        const first = piece[0]!;
        const a0 = along(first);
        const a1 = along(piece[piece.length - 1]!);
        const ac = (a0 + a1) / 2;
        const lc = piece.reduce((s, m) => s + lat(m), 0) / piece.length;
        out.push({
          cx: dx * ac + nx * lc,
          cz: dz * ac + nz * lc,
          hx: (a1 - a0) / 2 + first.len / 2,
          hz: first.thick / 2,
          h: first.h,
          yaw,
          kind: 'run',
          id: first.id,
          modules: piece.length,
        });
        piece = [];
      };
      for (const m of line) {
        const prev = piece[piece.length - 1];
        const start = piece[0];
        if (prev && (along(m) - along(prev) > RUN_GAP * m.len || along(m) + m.len / 2 - (along(start!) - start!.len / 2) > MAX_RUN_PIECE)) flush();
        piece.push(m);
      }
      flush();
    }
  }
  return out;
}

/** The colliders of one tile's rows. `keepOut` defaults to none (the plugin passes the real lanes, chase lines, triggers, anchors and doors). */
export function buildTileColliders(tile: string, rows: readonly PlacementRow[], keepOut: KeepOut = EMPTY_KEEP_OUT): TileColliders {
  const stats: ColliderStats = { rows: rows.length, modules: 0, dropped: 0, droppedBy: {}, skipped: 0, boxes: 0, runs: 0, runModules: 0, singles: 0, trunks: 0 };
  const runs: Module[] = [];
  const boxes: ColliderBox[] = [];
  for (const row of rows) {
    if (!row || typeof row.id !== 'string') continue;
    if (!shapeFor(row.id) && classOf(row.id) !== 'tree') continue;
    if (!finite(row.x) || !finite(row.z) || rowLift(row.dy) > 0) {
      stats.skipped++;
      continue;
    }
    const m = moduleFor(row, tile);
    if (!m) continue;
    stats.modules++;
    const why = keepOutHit(m, keepOut);
    if (why) {
      stats.dropped++;
      const key = why.split(' ')[0]!;
      stats.droppedBy[key] = (stats.droppedBy[key] ?? 0) + 1;
      continue;
    }
    if (m.kind === 'run') runs.push(m);
    else {
      boxes.push({ cx: m.cx, cz: m.cz, hx: m.hx, hz: m.hz, h: m.h, yaw: m.yaw, kind: m.kind, id: m.id, modules: 1 });
      if (m.kind === 'trunk') stats.trunks++;
      else stats.singles++;
    }
  }
  const merged = mergeRuns(runs);
  stats.runs = merged.length;
  stats.runModules = runs.length;
  boxes.push(...merged);
  stats.boxes = boxes.length;
  return { boxes, stats };
}

// ---------------------------------------------------------------- cells

/** Side of a streaming cell (m). */
export const COLLIDER_CELL = 64;
export const cellOf = (x: number, z: number): [number, number] => [Math.floor(x / COLLIDER_CELL), Math.floor(z / COLLIDER_CELL)];
export const cellKey = (ix: number, iz: number): string => `${ix},${iz}`;

/** Boxes bucketed by the cell of their centre. */
export function bucketByCell(boxes: readonly ColliderBox[]): Map<string, ColliderBox[]> {
  const out = new Map<string, ColliderBox[]>();
  for (const b of boxes) {
    const [ix, iz] = cellOf(b.cx, b.cz);
    const k = cellKey(ix, iz);
    (out.get(k) ?? out.set(k, []).get(k)!).push(b);
  }
  return out;
}

/** The boxes of `boxes` that touch the rectangle (for the nav grids). */
export function boxesInRect(boxes: readonly ColliderBox[], r: { x0: number; z0: number; x1: number; z1: number }): ColliderBox[] {
  return boxes.filter((b) => {
    const c = Math.abs(Math.cos(b.yaw));
    const s = Math.abs(Math.sin(b.yaw));
    const ex = b.hx * c + b.hz * s;
    const ez = b.hx * s + b.hz * c;
    return b.cx + ex > r.x0 && b.cx - ex < r.x1 && b.cz + ez > r.z0 && b.cz - ez < r.z1;
  });
}
