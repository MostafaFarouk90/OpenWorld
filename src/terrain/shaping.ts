// Terrain shaping on top of the procedural heightfield (contracts/heightfield.md "Terrain shaping", v0.5):
// ridge suppression, flat plateaus and graded road corridors. Plain TypeScript with no Three.js imports, so it
// runs unchanged on the main thread and inside the terrain workers. `heightfield.ts` applies it inside `heightAt`.
// v0.7 (Act 3, K1): flats, uplifts and troughs, applied after suppression and before plateaus, so plateaus and roads
// are fitted on the ground they make. Every new feature keeps out of the protected boxes (Acts 1 and 2).
import { createNoise2D } from './noise';

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
   * max(blend, 1.5 * |cut or fill| / maxSideSlope) where the road leaves the ground (measured at the centre, the road
   * edges and the blend edges), capped at MAX_ROAD_BLEND.
   */
  maxSideSlope?: number;
  /** v0.7: a lower cap on the blend than MAX_ROAD_BLEND (mountain switchbacks with rock-cut sides). */
  maxBlend?: number;
}

/** A bog pool mask inside a flat: low-frequency patches pressed down to `floor`. */
export interface FlatPoolsDef {
  floor: number;
  /** Noise wavelength in metres. */
  scale: number;
  /** 0..1: the share of the flat the pools cover (roughly). */
  cover: number;
  /** Noise seed offset (default 0). */
  seed?: number;
}

/** A round hollow inside a flat (a lake): `floor` inside `radius`, a shelf at `shelfFloor` out to `radius + shelfWidth`. */
export interface FlatBowlDef {
  x: number;
  z: number;
  radius: number;
  floor: number;
  shelfWidth: number;
  shelfFloor: number;
  /** Blend from the shelf's outer edge back to the flat. */
  blend: number;
}

/**
 * Presses the ground toward `level` inside `box` (blended over `blend`): `level + (h - level) * relief`, then a soft
 * ceiling `level + maxRise` when given, then pools and bowls. Marsh and lowland flats (Act 3).
 */
export interface FlatDef {
  id: string;
  box: ShapeBox;
  blend: number;
  level: number;
  /** 0..1: how much of the ground's relief around `level` is kept. */
  relief: number;
  /** Soft cap on what is left above `level` (metres). */
  maxRise?: number;
  pools?: FlatPoolsDef;
  bowls?: readonly FlatBowlDef[];
}

/** A point of an uplift's spine: the crest height there. */
export interface SpinePoint {
  x: number;
  z: number;
  height: number;
}

/**
 * A massif raised along a spine (Act 3's Dragonspine): the crest height interpolated along the spine, falling off to 0
 * at `radius` from it (`(1 - smoothstep(0, 1, d / radius)) ^ profile`), with ridged crags of up to `crags` metres on
 * the flanks; the ground becomes the smooth max of itself and the massif, under a soft ceiling. One point is a peak.
 */
export interface UpliftDef {
  id: string;
  spine: readonly SpinePoint[];
  radius: number;
  /** Crag amplitude in metres (0 for a smooth massif). */
  crags: number;
  /** Flank exponent: above 1 peaked, below 1 shoulders with steep edges. Default 1. */
  profile?: number;
  /** Soft ceiling (metres): nothing this uplift makes reaches it. At most the height range's max. */
  ceiling: number;
}

/** A point of a trough's floor line. */
export interface TroughPoint {
  x: number;
  z: number;
  floor: number;
}

/** Cuts the ground down to the floor along a polyline (a chasm, a river channel): it only ever lowers. */
export interface TroughDef {
  id: string;
  points: readonly TroughPoint[];
  halfWidth: number;
  blend: number;
}

export interface TerrainShape {
  plateaus: readonly PlateauDef[];
  suppressions: readonly RidgeSuppressionDef[];
  roads: readonly RoadDef[];
  /** v0.7, applied in this order after suppression and before plateaus. */
  flats?: readonly FlatDef[];
  uplifts?: readonly UpliftDef[];
  troughs?: readonly TroughDef[];
}

export const DEFAULT_MAX_SIDE_SLOPE = 0.6;
/** The widest a road's blend can grow (metres either side of its half-width). */
export const MAX_ROAD_BLEND = 300;
/** Profile samples either side over which a blend width is widened to its neighbours' (10 x 5 m). */
const BLEND_WINDOW = 10;
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
  /** v0.7: boxes no flat, uplift or trough may reach (the shipped Act 1 and 2 ground). */
  protectedBoxes?: readonly ShapeBox[];
  /** v0.7: no trough, pool or bowl floor may be at or under this (the kill plane plus a margin). */
  minFloor?: number;
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

/** Smooth max of a and b with a blend width k (k <= 0 is the plain max). */
function smoothMax(a: number, b: number, k: number): number {
  if (k <= 0) return Math.max(a, b);
  const h = Math.min(Math.max(0.5 + (0.5 * (b - a)) / k, 0), 1);
  return a + (b - a) * h + k * h * (1 - h);
}

/** Leaves v alone below `ceiling - knee`, then eases it toward `ceiling` without reaching it. */
function softCeiling(v: number, ceiling: number, knee: number): number {
  const start = ceiling - knee;
  return v <= start ? v : ceiling - knee * Math.exp(-(v - start) / knee);
}

/** Width of an uplift's smooth max with the ground, and of the soft ceilings' knee (metres). */
const UPLIFT_SMOOTH = 40;
const CEILING_KNEE = 40;

const cragNoise = createNoise2D(7331);
const poolNoise = createNoise2D(7332);

/** Ridged crags in 0..1, 3 octaves at a 700 m base wavelength. Plain world metres: CPU doubles keep the precision. */
function crag(x: number, z: number): number {
  let sum = 0;
  let amp = 0.55;
  let freq = 1 / 700;
  let weight = 1;
  for (let o = 0; o < 3; o++) {
    let r = 1 - Math.abs(cragNoise(x * freq, z * freq));
    r *= r * weight;
    weight = Math.min(r * 1.5, 1);
    sum += r * amp;
    amp *= 0.5;
    freq *= 2.2;
  }
  return Math.min(sum, 1);
}

/** Nearest point of a polyline of n points (xs, zs): its distance and the interpolated value of `vals` there. */
function nearestOnLine(xs: Float64Array, zs: Float64Array, vals: Float64Array, x: number, z: number): { d: number; v: number } {
  if (xs.length === 1) return { d: Math.hypot(x - xs[0], z - zs[0]), v: vals[0] };
  let best = Infinity;
  let v = vals[0];
  for (let i = 0; i < xs.length - 1; i++) {
    const ax = xs[i];
    const az = zs[i];
    const dx = xs[i + 1] - ax;
    const dz = zs[i + 1] - az;
    const len2 = dx * dx + dz * dz;
    const t = Math.min(Math.max(((x - ax) * dx + (z - az) * dz) / len2, 0), 1);
    const d = Math.hypot(x - (ax + dx * t), z - (az + dz * t));
    if (d < best) {
      best = d;
      v = vals[i] + (vals[i + 1] - vals[i]) * t;
    }
  }
  return { d: best, v };
}

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

function pointSegmentGap(px: number, pz: number, sg: Segment): number {
  const t = Math.min(Math.max((px - sg.ax) * sg.dx + (pz - sg.az) * sg.dz, 0), sg.len);
  return Math.hypot(px - (sg.ax + sg.dx * t), pz - (sg.az + sg.dz * t));
}

/** Shortest distance between two segments (0 when they cross). */
function segmentGap(a: Segment, b: Segment): number {
  const ex = a.ax + a.dx * a.len;
  const ez = a.az + a.dz * a.len;
  const fx = b.ax + b.dx * b.len;
  const fz = b.az + b.dz * b.len;
  const cross = (ox: number, oz: number, px: number, pz: number, qx: number, qz: number) => (px - ox) * (qz - oz) - (pz - oz) * (qx - ox);
  const d1 = cross(b.ax, b.az, fx, fz, a.ax, a.az);
  const d2 = cross(b.ax, b.az, fx, fz, ex, ez);
  const d3 = cross(a.ax, a.az, ex, ez, b.ax, b.az);
  const d4 = cross(a.ax, a.az, ex, ez, fx, fz);
  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) return 0;
  return Math.min(pointSegmentGap(a.ax, a.az, b), pointSegmentGap(ex, ez, b), pointSegmentGap(b.ax, b.az, a), pointSegmentGap(fx, fz, a));
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

  // ---- v0.7: flats, uplifts, troughs (in that order), kept out of every protected box
  const guarded = [...(protectedBox ? [protectedBox] : []), ...(opts.protectedBoxes ?? [])];
  const minFloor = opts.minFloor;
  const guard = (where: string, reach: ShapeBox) => {
    for (const g of guarded) if (overlaps(reach, g)) throw new Error(`${where}: reaches into a protected box`);
  };
  const checkFloor = (where: string, floor: number) => {
    if (!Number.isFinite(floor)) throw new Error(`${where}: floor must be finite`);
    if (minFloor !== undefined && floor <= minFloor) throw new Error(`${where}: floor ${floor} is at or under the minimum floor ${minFloor}`);
  };

  const flats = (shape.flats ?? []).map((f) => {
    const where = `terrain shape: flat "${f.id}"`;
    claimId('flat', f.id);
    checkBox(where, f.box, bounds);
    if (!finite(f.blend, f.level, f.relief) || f.blend <= 0) throw new Error(`${where}: level, relief and blend must be finite, blend > 0`);
    if (f.relief < 0 || f.relief > 1) throw new Error(`${where}: relief must be in 0..1`);
    if (range && (f.level < range.min || f.level > range.max)) throw new Error(`${where}: level outside the terrain range`);
    if (f.maxRise !== undefined && !(Number.isFinite(f.maxRise) && f.maxRise > 0)) throw new Error(`${where}: maxRise must be > 0`);
    if (f.pools) {
      const p = f.pools;
      if (!finite(p.scale, p.cover) || p.scale <= 0 || p.cover < 0 || p.cover > 1) throw new Error(`${where}: pools need scale > 0 and cover in 0..1`);
      checkFloor(`${where} pools`, p.floor);
    }
    for (const b of f.bowls ?? []) {
      if (!finite(b.x, b.z, b.radius, b.shelfWidth, b.blend) || b.radius <= 0 || b.shelfWidth < 0 || b.blend <= 0) throw new Error(`${where}: bowl needs radius > 0, shelfWidth >= 0, blend > 0`);
      if (!inBox(f.box, b.x, b.z)) throw new Error(`${where}: bowl centre lies outside the flat's box`);
      checkFloor(`${where} bowl`, b.floor);
      checkFloor(`${where} bowl shelf`, b.shelfFloor);
    }
    const reach = expand(f.box, f.blend);
    guard(where, reach);
    // Pools cover about `cover` of the box: noise in [-1, 1] above a threshold, with a soft 0.12 edge.
    const threshold = f.pools ? 1 - 2 * f.pools.cover : 0;
    return { def: f, reach, threshold };
  });

  const flatten = (x: number, z: number, h: number): number => {
    for (const f of flats) {
      if (!inBox(f.reach, x, z)) continue;
      const w = 1 - smoothstep(0, f.def.blend, boxDistance(f.def.box, x, z));
      if (w <= 0) continue;
      const d = f.def;
      let t = d.level + (h - d.level) * d.relief;
      if (d.maxRise !== undefined) t = softCeiling(t, d.level + d.maxRise, Math.min(CEILING_KNEE, d.maxRise / 2));
      if (d.pools) {
        const p = d.pools;
        const n = poolNoise(x / p.scale + (p.seed ?? 0) * 17.31, z / p.scale - (p.seed ?? 0) * 9.77);
        const m = smoothstep(f.threshold - 0.12, f.threshold + 0.12, n);
        if (m > 0 && p.floor < t) t += (p.floor - t) * m;
      }
      for (const b of d.bowls ?? []) {
        const r = Math.hypot(x - b.x, z - b.z);
        const outer = b.radius + b.shelfWidth;
        if (r >= outer + b.blend) continue;
        const target = b.floor + (b.shelfFloor - b.floor) * smoothstep(b.radius - 15, b.radius + 15, r);
        const bw = 1 - smoothstep(outer, outer + b.blend, r);
        t += (target - t) * bw;
      }
      h += (t - h) * w;
    }
    return h;
  };

  const uplifts = (shape.uplifts ?? []).map((u) => {
    const where = `terrain shape: uplift "${u.id}"`;
    claimId('uplift', u.id);
    if (!Array.isArray(u.spine) || u.spine.length < 1) throw new Error(`${where}: needs at least 1 spine point`);
    if (!finite(u.radius, u.crags, u.ceiling) || u.radius <= 0 || u.crags < 0) throw new Error(`${where}: radius must be > 0 and crags >= 0`);
    const profile = u.profile ?? 1;
    if (!Number.isFinite(profile) || profile <= 0) throw new Error(`${where}: profile must be > 0`);
    if (range && u.ceiling > range.max) throw new Error(`${where}: ceiling ${u.ceiling} is above the terrain range (${range.max})`);
    const xs = new Float64Array(u.spine.length);
    const zs = new Float64Array(u.spine.length);
    const hs = new Float64Array(u.spine.length);
    u.spine.forEach((p, i) => {
      if (!p || !finite(p.x, p.z, p.height)) throw new Error(`${where}: spine points must be finite`);
      if (bounds && !inBox(bounds, p.x, p.z)) throw new Error(`${where}: spine point (${p.x}, ${p.z}) outside the world bounds`);
      if (p.height > u.ceiling) throw new Error(`${where}: spine height ${p.height} is above its ceiling`);
      if (i > 0 && Math.hypot(p.x - xs[i - 1], p.z - zs[i - 1]) < 1e-6) throw new Error(`${where}: spine segment ${i - 1} has zero length`);
      xs[i] = p.x;
      zs[i] = p.z;
      hs[i] = p.height;
    });
    const reach = expand({ minX: Math.min(...xs), maxX: Math.max(...xs), minZ: Math.min(...zs), maxZ: Math.max(...zs) }, u.radius);
    if (bounds) checkBox(where, { ...reach, minX: Math.max(reach.minX, bounds.minX), maxX: Math.min(reach.maxX, bounds.maxX), minZ: Math.max(reach.minZ, bounds.minZ), maxZ: Math.min(reach.maxZ, bounds.maxZ) }, bounds);
    guard(where, reach);
    return { def: u, xs, zs, hs, profile, reach };
  });

  const uplift = (x: number, z: number, h: number): number => {
    for (const u of uplifts) {
      if (!inBox(u.reach, x, z)) continue;
      const { d, v } = nearestOnLine(u.xs, u.zs, u.hs, x, z);
      if (d >= u.def.radius) continue;
      let f = 1 - smoothstep(0, 1, d / u.def.radius);
      if (u.profile !== 1) f = Math.pow(f, u.profile);
      // Crags grow up the flanks and fade toward the crest line, so a crest keeps its authored height.
      const flank = 4 * f * (1 - f);
      const massif = v * f + u.def.crags * flank * crag(x, z);
      // Faded in over the outer foot so the edge of the reach is seamless, even on ground under 0.
      const raised = softCeiling(smoothMax(h, massif, UPLIFT_SMOOTH * f), u.def.ceiling, CEILING_KNEE);
      h += (raised - h) * smoothstep(0, 0.15, f);
    }
    return h;
  };

  const troughs = (shape.troughs ?? []).map((t) => {
    const where = `terrain shape: trough "${t.id}"`;
    claimId('trough', t.id);
    if (!Array.isArray(t.points) || t.points.length < 2) throw new Error(`${where}: needs at least 2 points`);
    if (!finite(t.halfWidth, t.blend) || t.halfWidth <= 0 || t.blend <= 0) throw new Error(`${where}: halfWidth and blend must be > 0`);
    const xs = new Float64Array(t.points.length);
    const zs = new Float64Array(t.points.length);
    const fs = new Float64Array(t.points.length);
    t.points.forEach((p, i) => {
      if (!p || !finite(p.x, p.z)) throw new Error(`${where}: points must be finite`);
      if (bounds && !inBox(bounds, p.x, p.z)) throw new Error(`${where}: point (${p.x}, ${p.z}) outside the world bounds`);
      checkFloor(where, p.floor);
      if (i > 0 && Math.hypot(p.x - xs[i - 1], p.z - zs[i - 1]) < 1e-6) throw new Error(`${where}: segment ${i - 1} has zero length`);
      xs[i] = p.x;
      zs[i] = p.z;
      fs[i] = p.floor;
    });
    const reach = expand({ minX: Math.min(...xs), maxX: Math.max(...xs), minZ: Math.min(...zs), maxZ: Math.max(...zs) }, t.halfWidth + t.blend);
    guard(where, reach);
    return { def: t, xs, zs, fs, reach };
  });

  const trough = (x: number, z: number, h: number): number => {
    for (const t of troughs) {
      if (!inBox(t.reach, x, z)) continue;
      const { d, v } = nearestOnLine(t.xs, t.zs, t.fs, x, z);
      const hw = t.def.halfWidth;
      const w = d <= hw ? 1 : 1 - smoothstep(hw, hw + t.def.blend, d);
      if (w > 0 && v < h) h += (v - h) * w;
    }
    return h;
  };

  /** The ground before plateaus and roads: suppression, flats, uplifts, troughs. */
  const shaped =
    flats.length + uplifts.length + troughs.length === 0
      ? suppressed
      : (x: number, z: number): number => trough(x, z, uplift(x, z, flatten(x, z, suppressed(x, z))));

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

  const ground = (x: number, z: number): number => plateaued(x, z, shaped(x, z));

  // Blend slope of every plateau, measured against the ground on the ring at the blend's outer edge.
  for (const p of plateaus) {
    const ring = p.reach;
    let worst = 0;
    const visit = (x: number, z: number) => {
      worst = Math.max(worst, Math.abs(p.def.height - shaped(x, z)) / p.def.blend);
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

  /** Lays every road in `list` over `h` at (x, z), in order. */
  const applyRoads = (list: Iterable<BuiltRoad>, x: number, z: number, h: number): number => {
    for (const road of list) {
      if (!inBox(road.aabb, x, z)) continue;
      const at = locate(road, x, z);
      if (!at) continue;
      const w = roadWeight(road, at.s, at.d);
      if (w > 0) h += (sample(road.heights, road.step, road.length, at.s) - h) * w;
    }
    return h;
  };

  // ---- roads
  const roads = new Map<string, BuiltRoad>();
  // A road is fitted on the ground with every earlier road already laid, so a branch listed after its trunk starts at
  // the trunk's surface (v0.6, A1): the first road (the Dead Road) sees exactly the ground it always did.
  const roadGround = (x: number, z: number): number => applyRoads(roads.values(), x, z, ground(x, z));
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
    const blendCap = r.maxBlend ?? MAX_ROAD_BLEND;
    if (!Number.isFinite(blendCap) || blendCap < r.blend || blendCap > MAX_ROAD_BLEND) throw new Error(`${where}: maxBlend must be in blend..${MAX_ROAD_BLEND}`);
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
      g[i] = roadGround(sg.ax + sg.dx * t, sg.az + sg.dz * t);
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
    // Blend width per sample: the worst cut or fill at the centre, both road edges and both outer blend edges,
    // over the side slope, times 1.5 (the smoothstep's peak slope). Measured twice, the second time at the widened
    // edge, so a hillside rising beside the road counts. Capped at MAX_ROAD_BLEND.
    const blends = new Float64Array(n);
    let maxBlend = r.blend;
    seg = 0;
    for (let i = 0; i < n; i++) {
      const s = i * step;
      while (seg < segments.length - 1 && s > segments[seg].s0 + segments[seg].len) seg++;
      const sg = segments[seg];
      const t = Math.min(Math.max(s - sg.s0, 0), sg.len);
      const cx = sg.ax + sg.dx * t;
      const cz = sg.az + sg.dz * t;
      let cut = Math.abs(heights[i] - g[i]);
      for (const off of [r.halfWidth, -r.halfWidth]) cut = Math.max(cut, Math.abs(heights[i] - roadGround(cx + sg.dz * off, cz - sg.dx * off)));
      let b = Math.min(blendCap, Math.max(r.blend, (1.5 * cut) / sideSlope));
      for (let pass = 0; pass < 2; pass++) {
        const reachOut = r.halfWidth + b;
        let edgeCut = cut;
        for (const off of [reachOut, -reachOut]) edgeCut = Math.max(edgeCut, Math.abs(heights[i] - roadGround(cx + sg.dz * off, cz - sg.dx * off)));
        b = Math.min(blendCap, Math.max(b, (1.5 * edgeCut) / sideSlope));
      }
      blends[i] = b;
    }
    // Widths change slowly along the road (a running max over BLEND_WINDOW samples each way), so a narrow sample
    // between wide ones cannot leave a steep notch at the blend edge.
    const raw = blends.slice();
    for (let i = 0; i < n; i++) {
      let b = raw[i];
      for (let k = Math.max(0, i - BLEND_WINDOW); k <= Math.min(n - 1, i + BLEND_WINDOW); k++) b = Math.max(b, raw[k]);
      blends[i] = b;
      maxBlend = Math.max(maxBlend, b);
    }
    // Hairpins: two non-neighbouring segments whose blends overlap would give one point two arc positions (a cliff).
    const reachAll = r.halfWidth + maxBlend;
    for (let i = 0; i < segments.length; i++) {
      for (let j = i + 2; j < segments.length; j++) {
        const gap = segmentGap(segments[i], segments[j]);
        if (gap < 2 * reachAll) {
          throw new Error(`${where}: segments ${i} and ${j} are ${gap.toFixed(1)} m apart, closer than twice the road's reach (${reachAll.toFixed(0)} m)`);
        }
      }
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
      return applyRoads(builtRoads, x, z, plateaued(x, z, shaped(x, z)));
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
