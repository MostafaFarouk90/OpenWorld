// Act 4 thread L1: the Waste's rope-lines and shelters (plans/act4-L1.md section 7), the data L3's storms read and L4's
// R24 cart walks. Lines, shelters and posts are derived from the fitted centrelines in src/terrain/shape/waste.ts, so
// every consumer reads one source. Plain data and maths, worker-safe.
import { ROPE_LINE_IDS, ROPE_POINTS, type RopeLineId, type XZ } from '../../terrain/shape/waste';
import type { RopeLineDef, ShelterDef } from '../../weather/types';
import type { AnchorSpec } from '../layoutTypes';

/** A rope-line's geometry: the centreline and its shelters in order along it (L0's `RopeLineDef` names anchors instead). */
export interface RopeLineGeom {
  id: RopeLineId;
  points: readonly XZ[];
  shelters: readonly string[];
}

/** A storm shelter's geometry beside its line (L0's `ShelterDef` names its anchor instead). */
export interface ShelterSpot {
  id: string;
  at: { x: number; z: number };
  radius: number;
  /** The line it stands on and its arc along it (metres). */
  lineId: RopeLineId;
  arc: number;
}

/** Shelters are never further apart than this along a line (or from a line's ends). */
export const SHELTER_MAX_SPACING = 500;
export const SHELTER_RADIUS = 6;
/** A shelter stands this far off its line's centreline, so it never blocks the lane. */
export const SHELTER_OFFSET = 13;
/** A post every this many metres of arc, this far to the left of the centreline. */
export const POST_SPACING = 25;
export const POST_OFFSET = 2.2;
/** The storm-safe lane either side of a rope-line's centreline. */
export const ROPE_LANE_HALF_WIDTH = 4;
/** The shared junction shelter where the Walker Camp's line to the Glasslands crosses the Cinder Road North. */
export const CROSSING_SHELTER_ID = 'shelter.crossing';

const lineLength = (pts: readonly XZ[]): number => {
  let len = 0;
  for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  return len;
};

/** The point at `arc` metres along a polyline, with the unit direction there. */
export function pointAt(pts: readonly XZ[], arc: number): { x: number; z: number; dx: number; dz: number } {
  let left = Math.max(0, arc);
  for (let i = 1; i < pts.length; i++) {
    const [ax, az] = pts[i - 1];
    const [bx, bz] = pts[i];
    const len = Math.hypot(bx - ax, bz - az);
    if (left <= len || i === pts.length - 1) {
      const t = len > 0 ? Math.min(left / len, 1) : 0;
      return { x: ax + (bx - ax) * t, z: az + (bz - az) * t, dx: len > 0 ? (bx - ax) / len : 0, dz: len > 0 ? (bz - az) / len : 1 };
    }
    left -= len;
  }
  const [x, z] = pts[pts.length - 1];
  return { x, z, dx: 0, dz: 1 };
}

/** The arc of the point of a polyline nearest a given point. */
function arcOf(pts: readonly XZ[], x: number, z: number): number {
  let best = Infinity;
  let bestArc = 0;
  let s0 = 0;
  for (let i = 1; i < pts.length; i++) {
    const [ax, az] = pts[i - 1];
    const [bx, bz] = pts[i];
    const dx = bx - ax;
    const dz = bz - az;
    const len = Math.hypot(dx, dz);
    const t = Math.min(Math.max(((x - ax) * dx + (z - az) * dz) / (len * len), 0), 1);
    const d = Math.hypot(x - ax - dx * t, z - az - dz * t);
    if (d < best) {
      best = d;
      bestArc = s0 + len * t;
    }
    s0 += len;
  }
  return bestArc;
}

const r2 = (n: number) => Math.round(n * 100) / 100;
/** How far the Crossing's shelter stands from the junction, on its plateau. */
export const CROSSING_SHELTER_DISTANCE = 17;
/** The Crossing's shelter stands in the one quarter no line leaves by: north-west of the junction, between the camp's line and the road north. */
const CROSSING_SHELTER_AT = {
  x: r2(ROPE_POINTS['rope.cinder-road-north'][3][0] - CROSSING_SHELTER_DISTANCE * Math.SQRT1_2),
  z: r2(ROPE_POINTS['rope.cinder-road-north'][3][1] + CROSSING_SHELTER_DISTANCE * Math.SQRT1_2),
};

function buildShelters(): { lines: RopeLineGeom[]; shelters: ShelterSpot[] } {
  const shelters: ShelterSpot[] = [];
  const lines: RopeLineGeom[] = [];
  const crossing = ROPE_POINTS['rope.cinder-road-north'][3];
  for (const id of ROPE_LINE_IDS) {
    const pts = ROPE_POINTS[id];
    const len = lineLength(pts);
    const ids: string[] = [];
    // The Crossing is one shelter on two lines: it is on this line when the line passes through it.
    const crossArc = pts.some(([x, z]) => x === crossing[0] && z === crossing[1]) ? arcOf(pts, crossing[0], crossing[1]) : null;
    // Interior shelters split each stretch (end to end, or end to the Crossing) into equal legs no longer than the max.
    const stretches: [number, number][] = crossArc === null ? [[0, len]] : [[0, crossArc], [crossArc, len]].filter(([a, b]) => b - a > 1) as [number, number][];
    let n = 0;
    for (const [a, b] of stretches) {
      if (crossArc !== null && a === crossArc && ids[ids.length - 1] !== CROSSING_SHELTER_ID) {
        ids.push(CROSSING_SHELTER_ID);
        if (!shelters.some((s) => s.id === CROSSING_SHELTER_ID)) {
          shelters.push({ id: CROSSING_SHELTER_ID, at: CROSSING_SHELTER_AT, radius: SHELTER_RADIUS, lineId: id, arc: r2(crossArc) });
        }
      }
      const legs = Math.ceil((b - a) / SHELTER_MAX_SPACING);
      for (let k = 1; k < legs; k++) {
        const arc = a + ((b - a) * k) / legs;
        const p = pointAt(pts, arc);
        // Left of the direction of travel: (-dz, dx).
        n++;
        const sid = `shelter.${id.replace('rope.', '')}.${n}`;
        ids.push(sid);
        shelters.push({ id: sid, at: { x: r2(p.x - p.dz * SHELTER_OFFSET), z: r2(p.z + p.dx * SHELTER_OFFSET) }, radius: SHELTER_RADIUS, lineId: id, arc: r2(arc) });
      }
      if (crossArc !== null && b === crossArc) {
        ids.push(CROSSING_SHELTER_ID);
        if (!shelters.some((s) => s.id === CROSSING_SHELTER_ID)) {
          shelters.push({ id: CROSSING_SHELTER_ID, at: CROSSING_SHELTER_AT, radius: SHELTER_RADIUS, lineId: id, arc: r2(crossArc) });
        }
      }
    }
    lines.push({ id, points: pts, shelters: ids });
  }
  return { lines, shelters };
}

const built = buildShelters();
/** Every rope-line's geometry, Cinder Road North first. Never copy a point. */
export const ROPE_LINE_GEOMS: readonly RopeLineGeom[] = built.lines;
export const SHELTER_SPOTS: readonly ShelterSpot[] = built.shelters;

/** The anchor at a rope-line's `i`th centreline point, and at a shelter. */
export const ropePointAnchorId = (id: RopeLineId, i: number): string => `waste.${id}.${i}`;
export const shelterAnchorId = (shelterId: string): string => `waste.${shelterId}`;

/** L0's contract shapes (v0.8, src/weather/types.ts), what L3's storms read: lines and shelters by anchor id. */
export const ROPE_LINES: readonly RopeLineDef[] = ROPE_LINE_GEOMS.map((l) => ({ id: l.id, points: l.points.map((_, i) => ropePointAnchorId(l.id, i)), shelters: l.shelters }));
export const SHELTERS: readonly ShelterDef[] = SHELTER_SPOTS.map((s) => ({ id: s.id, at: shelterAnchorId(s.id), radius: s.radius }));

/** The anchors those ids name (in ACT4_WORLD_LAYOUT). */
export const ROPE_ANCHORS: readonly AnchorSpec[] = [
  ...ROPE_LINE_GEOMS.flatMap((l) => l.points.map(([x, z], i) => ({ id: ropePointAnchorId(l.id, i), x, z, yawDeg: 0, tags: ['rope-line'] }))),
  ...SHELTER_SPOTS.map((s) => ({ id: shelterAnchorId(s.id), x: s.at.x, z: s.at.z, yawDeg: 0, tags: ['shelter'] })),
];

export const ropeLine = (id: RopeLineId): RopeLineGeom => {
  const l = ROPE_LINE_GEOMS.find((r) => r.id === id);
  if (!l) throw new Error(`rope-lines: unknown line "${id}"`);
  return l;
};
export const ropeLineLength = (id: RopeLineId): number => lineLength(ropeLine(id).points);

/** Post positions along a line: every POST_SPACING metres, POST_OFFSET to the left, none inside a shelter's radius. */
export function ropePosts(id: RopeLineId): { x: number; z: number; yawDeg: number }[] {
  const pts = ropeLine(id).points;
  const len = lineLength(pts);
  const out: { x: number; z: number; yawDeg: number }[] = [];
  for (let arc = 0; arc <= len + 1e-6; arc += POST_SPACING) {
    const p = pointAt(pts, arc);
    const x = p.x - p.dz * POST_OFFSET;
    const z = p.z + p.dx * POST_OFFSET;
    if (SHELTER_SPOTS.some((s) => Math.hypot(s.at.x - x, s.at.z - z) <= s.radius)) continue;
    out.push({ x: r2(x), z: r2(z), yawDeg: r2((Math.atan2(-p.dz, p.dx) * 180) / Math.PI) });
  }
  return out;
}

// ---- nearest rope (L3's storm-safe lanes): a bucket grid over the lines' extent

const CELL = 200;
interface Seg {
  ax: number;
  az: number;
  bx: number;
  bz: number;
  s0: number;
  lineId: RopeLineId;
}
const segs: Seg[] = [];
for (const l of ROPE_LINE_GEOMS) {
  let s0 = 0;
  for (let i = 1; i < l.points.length; i++) {
    const [ax, az] = l.points[i - 1];
    const [bx, bz] = l.points[i];
    segs.push({ ax, az, bx, bz, s0, lineId: l.id });
    s0 += Math.hypot(bx - ax, bz - az);
  }
}
const ext = {
  x0: Math.min(...segs.flatMap((s) => [s.ax, s.bx])) - CELL,
  z0: Math.min(...segs.flatMap((s) => [s.az, s.bz])) - CELL,
  x1: Math.max(...segs.flatMap((s) => [s.ax, s.bx])) + CELL,
  z1: Math.max(...segs.flatMap((s) => [s.az, s.bz])) + CELL,
};
const cols = Math.ceil((ext.x1 - ext.x0) / CELL);
const rows = Math.ceil((ext.z1 - ext.z0) / CELL);
/** The furthest `nearestRope` looks (beyond it, null). */
export const NEAREST_ROPE_LIMIT = CELL;

function segDist(s: Seg, x: number, z: number): { d: number; arc: number } {
  const dx = s.bx - s.ax;
  const dz = s.bz - s.az;
  const len = Math.hypot(dx, dz);
  const t = Math.min(Math.max(((x - s.ax) * dx + (z - s.az) * dz) / (len * len), 0), 1);
  return { d: Math.hypot(x - s.ax - dx * t, z - s.az - dz * t), arc: s.s0 + len * t };
}

let grid: Seg[][] | null = null;
function buildGrid(): Seg[][] {
  const g: Seg[][] = Array.from({ length: cols * rows }, () => []);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cx = ext.x0 + (c + 0.5) * CELL;
      const cz = ext.z0 + (r + 0.5) * CELL;
      for (const s of segs) if (segDist(s, cx, cz).d <= NEAREST_ROPE_LIMIT + CELL * Math.SQRT1_2) g[r * cols + c].push(s);
    }
  }
  return g;
}

/** The nearest rope-line within NEAREST_ROPE_LIMIT of (x, z): its id, the distance to its centreline and the arc there. */
export function nearestRope(x: number, z: number): { lineId: RopeLineId; distance: number; arc: number } | null {
  const c = Math.floor((x - ext.x0) / CELL);
  const r = Math.floor((z - ext.z0) / CELL);
  if (!(c >= 0 && r >= 0 && c < cols && r < rows)) return null;
  grid ??= buildGrid();
  let best: { lineId: RopeLineId; distance: number; arc: number } | null = null;
  for (const s of grid[r * cols + c]) {
    const { d, arc } = segDist(s, x, z);
    if (d <= NEAREST_ROPE_LIMIT && (!best || d < best.distance)) best = { lineId: s.lineId, distance: d, arc };
  }
  return best;
}

/** True on a rope-line's storm-safe lane. */
export const onRopeLane = (x: number, z: number): boolean => (nearestRope(x, z)?.distance ?? Infinity) <= ROPE_LANE_HALF_WIDTH;
