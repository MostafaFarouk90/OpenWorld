// Terrain shaping on top of the procedural heightfield (contracts/heightfield.md "Terrain shaping", v0.5):
// ridge suppression, flat plateaus and graded road corridors. Plain TypeScript with no Three.js imports, so it
// runs unchanged on the main thread and inside the terrain workers. `heightfield.ts` applies it inside `heightAt`.

/** Axis-aligned box in engine metres (+Z north). */
export interface ShapeBox {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

/** Exactly flat at `height` inside `box`; smoothstep back to the ground over `blend` metres outside it. */
export interface PlateauDef {
  id: string;
  box: ShapeBox;
  height: number;
  blend: number;
}

/** Scales the ridged-mountain term by `1 - strength` inside `box`, blended over `blend` metres. */
export interface RidgeSuppressionDef {
  id: string;
  box: ShapeBox;
  blend: number;
  /** 0..1; 1 removes the ridges entirely. */
  strength: number;
}

/** A road corridor along a polyline with a grade-limited, level cross-section. */
export interface RoadDef {
  id: string;
  /** Centreline, at least 2 points, no zero-length segments. */
  points: readonly { x: number; z: number }[];
  /** Flat road plus verge on each side of the centreline. */
  halfWidth: number;
  /** Minimum blend back to the ground beyond `halfWidth`. */
  blend: number;
  /** Largest centreline grade (rise over run) past `startTaper`. */
  maxGrade: number;
  /** The road fades in over this much arc from `points[0]`, so the ground at the start is untouched. */
  startTaper: number;
  /**
   * Largest average side slope of the cut or fill (default 0.6): the blend widens to
   * max(blend, |cut or fill| / maxSideSlope) where the road leaves the ground.
   */
  maxSideSlope?: number;
}

export interface TerrainShape {
  plateaus: readonly PlateauDef[];
  suppressions: readonly RidgeSuppressionDef[];
  roads: readonly RoadDef[];
}

export const DEFAULT_MAX_SIDE_SLOPE = 0.6;
/** Largest plateau blend slope `validateShape` accepts (|height - ground at the blend edge| / blend). */
export const MAX_PLATEAU_BLEND_SLOPE = 0.5;
/** Arc spacing of a road's precomputed profile, in metres. */
export const PROFILE_STEP = 5;

/**
 * Phase A ground that shaping must never change (Brightwater up to the fog wall at x 1100). Only a road's taper
 * may touch it, and only with weight exactly 0.
 */
export const PHASE_A_PROTECTED: ShapeBox = { minX: -1500, maxX: 1100, minZ: -1500, maxZ: 3500 };

/** Ground sampler before roads: `ridgeScale` multiplies the ridge term (1 = natural). */
export type BaseHeight = (x: number, z: number, ridgeScale: number) => number;

export interface ShaperOptions {
  /** Every feature box (and every road point) must lie inside these bounds. */
  bounds?: ShapeBox;
  /** Plateau heights must lie inside this range. */
  heightRange?: { min: number; max: number };
  protectedBox?: ShapeBox | null;
}

export interface Shaper {
  /** Shaped height at (x, z): suppression, then plateaus, then roads. */
  heightAt(x: number, z: number): number;
  /** The ridge multiplier at (x, z) (1 outside every suppression). */
  ridgeScale(x: number, z: number): number;
  /** Centreline profile height of road `id` at arc `s` (clamped), for tests and the map. */
  roadProfile(id: string, s: number): number;
  /** Total arc length of road `id`. */
  roadLength(id: string): number;
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(Math.max((x - edge0) / (edge1 - edge0), 0), 1);
  return t * t * (3 - 2 * t);
}

function boxDistance(b: ShapeBox, x: number, z: number): number {
  const dx = x < b.minX ? b.minX - x : x > b.maxX ? x - b.maxX : 0;
  const dz = z < b.minZ ? b.minZ - z : z > b.maxZ ? z - b.maxZ : 0;
  return dx === 0 ? dz : dz === 0 ? dx : Math.hypot(dx, dz);
}

function expand(b: ShapeBox, m: number): ShapeBox {
  return { minX: b.minX - m, maxX: b.maxX + m, minZ: b.minZ - m, maxZ: b.maxZ + m };
}

function inBox(b: ShapeBox, x: number, z: number): boolean {
  return x >= b.minX && x <= b.maxX && z >= b.minZ && z <= b.maxZ;
}

function overlaps(a: ShapeBox, b: ShapeBox): boolean {
  return a.minX < b.maxX && a.maxX > b.minX && a.minZ < b.maxZ && a.maxZ > b.minZ;
}

const finite = (...v: number[]) => v.every(Number.isFinite);

function checkBox(where: string, b: ShapeBox, bounds: ShapeBox | undefined): void {
  if (!b || !finite(b.minX, b.maxX, b.minZ, b.maxZ)) throw new Error(`${where}: box must be finite numbers`);
  if (b.minX >= b.maxX || b.minZ >= b.maxZ) throw new Error(`${where}: box is inverted or empty`);
  if (bounds && (b.minX < bounds.minX || b.maxX > bounds.maxX || b.minZ < bounds.minZ || b.maxZ > bounds.maxZ)) {
    throw new Error(`${where}: box lies outside the world bounds`);
  }
}

interface Segment {
  ax: number;
  az: number;
  dx: number;
  dz: number;
  len: number;
  s0: number;
  aabb: ShapeBox;
}

interface BuiltRoad {
  def: RoadDef;
  segments: Segment[];
  length: number;
  /** Profile heights and blend widths at s = i * step (the last sample at `length`). */
  heights: Float64Array;
  blends: Float64Array;
  step: number;
  aabb: ShapeBox;
}

function sample(arr: Float64Array, step: number, length: number, s: number): number {
  const c = Math.min(Math.max(s, 0), length);
  const f = c / step;
  const i = Math.min(Math.floor(f), arr.length - 2);
  const t = Math.min(f - i, 1);
  return arr[i] + (arr[i + 1] - arr[i]) * t;
}

/**
 * Builds the shaper and validates `shape` (throws on bad data; see `validateShape`). `base` is the natural ground
 * with a ridge multiplier; the road profiles are built from it once, here.
 */
export function buildShaper(shape: TerrainShape, base: BaseHeight, opts: ShaperOptions = {}): Shaper {
  const bounds = opts.bounds;
  const range = opts.heightRange;
  const protectedBox = opts.protectedBox === undefined ? PHASE_A_PROTECTED : opts.protectedBox;
  const ids = new Set<string>();
  const claimId = (kind: string, id: string) => {
    if (typeof id !== 'string' || id === '') throw new Error(`terrain shape: ${kind} needs an id`);
    if (ids.has(id)) throw new Error(`terrain shape: duplicate id "${id}"`);
    ids.add(id);
  };

  // ---- suppressions
  const suppressions = shape.suppressions.map((s) => {
    const where = `terrain shape: suppression "${s.id}"`;
    claimId('suppression', s.id);
    checkBox(where, s.box, bounds);
    if (!finite(s.blend, s.strength) || s.blend <= 0) throw new Error(`${where}: blend must be > 0`);
    if (s.strength < 0 || s.strength > 1) throw new Error(`${where}: strength must be in 0..1`);
    const reach = expand(s.box, s.blend);
    if (protectedBox && overlaps(reach, protectedBox)) throw new Error(`${where}: reaches into the Phase A protected box`);
    return { def: s, reach };
  });

  const ridgeScale = (x: number, z: number): number => {
    let scale = 1;
    for (const s of suppressions) {
      if (!inBox(s.reach, x, z)) continue;
      const w = 1 - smoothstep(0, s.def.blend, boxDistance(s.def.box, x, z));
      if (w > 0) scale *= 1 - s.def.strength * w;
    }
    return scale;
  };

  const suppressed = (x: number, z: number): number => base(x, z, ridgeScale(x, z));

  // ---- plateaus
  const plateaus = shape.plateaus.map((p) => {
    const where = `terrain shape: plateau "${p.id}"`;
    claimId('plateau', p.id);
    checkBox(where, p.box, bounds);
    if (!finite(p.height, p.blend) || p.blend <= 0) throw new Error(`${where}: height and blend must be finite, blend > 0`);
    if (range && (p.height < range.min || p.height > range.max)) throw new Error(`${where}: height outside the terrain range`);
    const reach = expand(p.box, p.blend);
    if (protectedBox && overlaps(reach, protectedBox)) throw new Error(`${where}: reaches into the Phase A protected box`);
    return { def: p, reach };
  });

  const plateaued = (x: number, z: number, h: number): number => {
    for (const p of plateaus) {
      if (!inBox(p.reach, x, z)) continue;
      const w = 1 - smoothstep(0, p.def.blend, boxDistance(p.def.box, x, z));
      if (w > 0) h += (p.def.height - h) * w;
    }
    return h;
  };

  const ground = (x: number, z: number): number => plateaued(x, z, suppressed(x, z));

  // Blend slope of every plateau, measured against the ground on the ring at the blend's outer edge.
  for (const p of plateaus) {
    const ring = p.reach;
    let worst = 0;
    const visit = (x: number, z: number) => {
      worst = Math.max(worst, Math.abs(p.def.height - suppressed(x, z)) / p.def.blend);
    };
    for (let x = ring.minX; x <= ring.maxX; x += 25) {
      visit(x, ring.minZ);
      visit(x, ring.maxZ);
    }
    for (let z = ring.minZ; z <= ring.maxZ; z += 25) {
      visit(ring.minX, z);
      visit(ring.maxX, z);
    }
    if (worst > MAX_PLATEAU_BLEND_SLOPE) {
      throw new Error(`terrain shape: plateau "${p.def.id}" blend slope ${worst.toFixed(2)} exceeds ${MAX_PLATEAU_BLEND_SLOPE}`);
    }
  }

  // ---- roads
  const roads = new Map<string, BuiltRoad>();
  for (const r of shape.roads) {
    const where = `terrain shape: road "${r.id}"`;
    claimId('road', r.id);
    if (!Array.isArray(r.points) || r.points.length < 2) throw new Error(`${where}: needs at least 2 points`);
    if (!finite(r.halfWidth, r.blend, r.maxGrade, r.startTaper) || r.halfWidth <= 0 || r.blend <= 0) {
      throw new Error(`${where}: halfWidth and blend must be > 0`);
    }
    if (r.maxGrade <= 0 || r.maxGrade >= 1) throw new Error(`${where}: maxGrade must be in (0, 1)`);
    if (r.startTaper < 0) throw new Error(`${where}: startTaper must be >= 0`);
    const sideSlope = r.maxSideSlope ?? DEFAULT_MAX_SIDE_SLOPE;
    if (!Number.isFinite(sideSlope) || sideSlope <= 0) throw new Error(`${where}: maxSideSlope must be > 0`);
    for (const p of r.points) {
      if (!p || !finite(p.x, p.z)) throw new Error(`${where}: points must be finite`);
      if (bounds && !inBox(bounds, p.x, p.z)) throw new Error(`${where}: point (${p.x}, ${p.z}) outside the world bounds`);
    }

    const segments: Segment[] = [];
    let length = 0;
    for (let i = 0; i < r.points.length - 1; i++) {
      const a = r.points[i];
      const b = r.points[i + 1];
      const len = Math.hypot(b.x - a.x, b.z - a.z);
      if (!(len > 1e-6)) throw new Error(`${where}: segment ${i} has zero length`);
      segments.push({
        ax: a.x,
        az: a.z,
        dx: (b.x - a.x) / len,
        dz: (b.z - a.z) / len,
        len,
        s0: length,
        aabb: { minX: Math.min(a.x, b.x), maxX: Math.max(a.x, b.x), minZ: Math.min(a.z, b.z), maxZ: Math.max(a.z, b.z) },
      });
      length += len;
    }
    if (r.startTaper >= length) throw new Error(`${where}: startTaper is longer than the road`);

    // Centreline ground every `step` metres, the last sample exactly at the end.
    const n = Math.max(2, Math.ceil(length / PROFILE_STEP) + 1);
    const step = length / (n - 1);
    const g = new Float64Array(n);
    let seg = 0;
    for (let i = 0; i < n; i++) {
      const s = i * step;
      while (seg < segments.length - 1 && s > segments[seg].s0 + segments[seg].len) seg++;
      const sg = segments[seg];
      const t = Math.min(Math.max(s - sg.s0, 0), sg.len);
      g[i] = ground(sg.ax + sg.dx * t, sg.az + sg.dz * t);
    }
    const start = g[0];
    const end = g[n - 1];
    const grade = r.maxGrade;
    if (Math.abs(end - start) > grade * length + 1e-9) {
      throw new Error(`${where}: the ends differ by ${Math.abs(end - start).toFixed(1)} m, more than maxGrade allows`);
    }
    // Pinned ends, then one forward clamp: within the cones from both ends, every step within the grade.
    const heights = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      const s = i * step;
      const lo = Math.max(start - grade * s, end - grade * (length - s));
      const hi = Math.min(start + grade * s, end + grade * (length - s));
      let h = Math.min(Math.max(g[i], lo), hi);
      if (i > 0) h = Math.min(Math.max(h, heights[i - 1] - grade * step), heights[i - 1] + grade * step);
      heights[i] = h;
    }
    heights[0] = start;
    heights[n - 1] = end;
    const blends = new Float64Array(n);
    let maxBlend = r.blend;
    for (let i = 0; i < n; i++) {
      blends[i] = Math.max(r.blend, Math.abs(heights[i] - g[i]) / sideSlope);
      maxBlend = Math.max(maxBlend, blends[i]);
    }
    const reach = r.halfWidth + maxBlend;
    for (const sg of segments) sg.aabb = expand(sg.aabb, reach);
    const aabb = segments.reduce<ShapeBox>(
      (acc, sg) => ({
        minX: Math.min(acc.minX, sg.aabb.minX),
        maxX: Math.max(acc.maxX, sg.aabb.maxX),
        minZ: Math.min(acc.minZ, sg.aabb.minZ),
        maxZ: Math.max(acc.maxZ, sg.aabb.maxZ),
      }),
      { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity },
    );
    roads.set(r.id, { def: r, segments, length, heights, blends, step, aabb });
  }

  /** Arc position and distance of (x, z) on a road, blended across bend bisectors; null outside its reach. */
  const locate = (road: BuiltRoad, x: number, z: number): { s: number; d: number } | null => {
    let d1 = Infinity;
    let s1 = 0;
    let i1 = -1;
    let d2 = Infinity;
    let s2 = 0;
    let i2 = -1;
    const segs = road.segments;
    for (let i = 0; i < segs.length; i++) {
      const sg = segs[i];
      if (!inBox(sg.aabb, x, z)) continue;
      const t = Math.min(Math.max((x - sg.ax) * sg.dx + (z - sg.az) * sg.dz, 0), sg.len);
      const d = Math.hypot(x - (sg.ax + sg.dx * t), z - (sg.az + sg.dz * t));
      const s = sg.s0 + t;
      if (d < d1) {
        d2 = d1;
        s2 = s1;
        i2 = i1;
        d1 = d;
        s1 = s;
        i1 = i;
      } else if (d < d2) {
        d2 = d;
        s2 = s;
        i2 = i;
      }
    }
    if (i1 < 0) return null;
    // Inside a bend two neighbouring segments are near-equidistant with different arc positions: mix them so the
    // height is continuous across the bisector (half and half exactly on it).
    if (i2 >= 0 && Math.abs(i2 - i1) === 1) {
      const band = road.def.halfWidth + road.def.blend;
      const mix = 0.5 * (1 - smoothstep(0, band, d2 - d1));
      if (mix > 0) s1 += (s2 - s1) * mix;
    }
    return { s: s1, d: d1 };
  };

  const roadWeight = (road: BuiltRoad, s: number, d: number): number => {
    const taper = road.def.startTaper > 0 ? smoothstep(0, road.def.startTaper, s) : s > 0 ? 1 : 0;
    if (taper === 0) return 0;
    const hw = road.def.halfWidth;
    if (d <= hw) return taper;
    const blend = sample(road.blends, road.step, road.length, s);
    return taper * (1 - smoothstep(hw, hw + blend, d));
  };

  const builtRoads = [...roads.values()];
  // The protected box may be touched only by a road's taper, with weight exactly 0.
  if (protectedBox) {
    for (const road of builtRoads) {
      if (!overlaps(road.aabb, protectedBox)) continue;
      const area: ShapeBox = {
        minX: Math.max(road.aabb.minX, protectedBox.minX),
        maxX: Math.min(road.aabb.maxX, protectedBox.maxX),
        minZ: Math.max(road.aabb.minZ, protectedBox.minZ),
        maxZ: Math.min(road.aabb.maxZ, protectedBox.maxZ),
      };
      if ((area.maxX - area.minX) * (area.maxZ - area.minZ) > 4e6) {
        throw new Error(`terrain shape: road "${road.def.id}" reaches deep into the Phase A protected box`);
      }
      for (let x = area.minX; x <= area.maxX; x += 2) {
        for (let z = area.minZ; z <= area.maxZ; z += 2) {
          const at = locate(road, x, z);
          if (at && roadWeight(road, at.s, at.d) > 0) {
            throw new Error(`terrain shape: road "${road.def.id}" changes Phase A ground at (${x}, ${z})`);
          }
        }
      }
    }
  }

  return {
    ridgeScale,
    heightAt(x, z) {
      let h = suppressed(x, z);
      h = plateaued(x, z, h);
      for (const road of builtRoads) {
        if (!inBox(road.aabb, x, z)) continue;
        const at = locate(road, x, z);
        if (!at) continue;
        const w = roadWeight(road, at.s, at.d);
        if (w > 0) h += (sample(road.heights, road.step, road.length, at.s) - h) * w;
      }
      return h;
    },
    roadProfile(id, s) {
      const road = roads.get(id);
      if (!road) throw new Error(`terrain shape: unknown road "${id}"`);
      return sample(road.heights, road.step, road.length, s);
    },
    roadLength(id) {
      const road = roads.get(id);
      if (!road) throw new Error(`terrain shape: unknown road "${id}"`);
      return road.length;
    },
  };
}

/** Throws with the first problem in `shape` (the same checks `buildShaper` runs). */
export function validateShape(shape: TerrainShape, base: BaseHeight, opts: ShaperOptions = {}): void {
  buildShaper(shape, base, opts);
}
