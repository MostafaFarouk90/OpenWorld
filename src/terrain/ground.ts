// Region ground rules (thread A1, design 5.3 and 5.4): Cinderreach's black soil, yellow grass, ember seams and ash-fog
// in the dips; Oldsmoke's rust-red rock, rusty soil and slag-grey spoil patches. Plain TypeScript with no Three.js, so
// the terrain workers run it: they colour the vertices and fill the `ground` attribute (ember weight, ash-fog weight)
// that the ground shader (groundShader.ts) reads. Where every weight is 0 nothing here changes Act 1's colours.
//
// Far from the origin, noise sampled at raw world coordinates loses float32 precision (A0's Step 0), so every pattern
// here and in the shader samples a region-local coordinate: world minus ACT2_GROUND_ORIGIN, one origin between both
// regions so no triangle ever mixes two. Act 3 (thread K1) adds the Greyfen marsh and the Dragonspine peaks, each with
// its own origin: they are 10 km apart and 22 km from Act 2's, so one origin cannot serve all four regions.
import { REGION_IDS, REGION_INFO, engineBox, type RegionId } from '../region/regions';
import { createNoise2D } from './noise';
import { ACT2_PLATEAUS, ACT2_ROADS } from './shape/act2';
import { GREYFEN_WATER_TABLE } from './shape/greyfen';
import type { ShapeBox } from './shaping';

/** The Act 2 ground's local origin (engine metres): every point of both regions lies within 9 km of it. */
export const ACT2_GROUND_ORIGIN = { x: 19000, z: 5000 } as const;
/** The Greyfen ground's local origin: Hathren's Mere, the middle of the marsh (engine metres). */
export const GREYFEN_GROUND_ORIGIN = { x: 3000, z: 12500 } as const;
/** The Dragonspine ground's local origin, near the Wyrm's Hearth (engine metres). */
export const DRAGONSPINE_GROUND_ORIGIN = { x: 13500, z: 14000 } as const;

/** Which origin a chunk's material samples: one per region family, never raw world coordinates. */
export type GroundOriginKey = 'act2' | 'greyfen' | 'dragonspine';
export const GROUND_ORIGINS: Readonly<Record<GroundOriginKey, { readonly x: number; readonly z: number }>> = {
  act2: ACT2_GROUND_ORIGIN,
  greyfen: GREYFEN_GROUND_ORIGIN,
  dragonspine: DRAGONSPINE_GROUND_ORIGIN,
};

/** A rule's weight smoothsteps from 1 at its region box to 0 this far outside it. */
export const GROUND_BLEND = 600;

export type GroundKey = 'cinderreach' | 'oldsmoke' | 'greyfen' | 'dragonspine';

const ORIGIN_OF: Readonly<Record<GroundKey, GroundOriginKey>> = { cinderreach: 'act2', oldsmoke: 'act2', greyfen: 'greyfen', dragonspine: 'dragonspine' };

export interface GroundRule {
  /** Linear RGB of open ground and of steep rock. */
  soil: readonly [number, number, number];
  rock: readonly [number, number, number];
  /** Grass tufts on this ground. */
  grass: readonly [number, number, number];
  /** Fraction of grass tufts kept (1 = all). */
  grassDensity: number;
  embers: boolean;
  ashFog: boolean;
  /** Dark slag patches over the soil, from a low-frequency mask (Oldsmoke's spoil). */
  spoil?: readonly [number, number, number];
  /** Dark wet peat patches over the soil, from a low-frequency mask, and darker soil toward the water table (Greyfen). */
  peat?: readonly [number, number, number];
  /** Snow by height and slope (Dragonspine), and the forge-glass veins the shader draws. */
  snow?: boolean;
}

export const GROUND_RULES: Readonly<Record<GroundKey, GroundRule>> = {
  cinderreach: {
    soil: [0.05, 0.045, 0.04],
    rock: [0.12, 0.11, 0.105],
    grass: [0.55, 0.45, 0.13],
    grassDensity: 1,
    embers: true,
    ashFog: true,
  },
  oldsmoke: {
    soil: [0.24, 0.115, 0.065],
    rock: [0.4, 0.17, 0.09],
    grass: [0.38, 0.14, 0.07],
    grassDensity: 0.4,
    embers: false,
    ashFog: false,
    spoil: [0.1, 0.095, 0.09],
  },
  greyfen: {
    soil: [0.13, 0.17, 0.125],
    rock: [0.2, 0.22, 0.19],
    grass: [0.36, 0.46, 0.38],
    grassDensity: 1,
    embers: false,
    ashFog: false,
    peat: [0.035, 0.04, 0.03],
  },
  dragonspine: {
    soil: [0.045, 0.045, 0.05],
    rock: [0.018, 0.018, 0.022],
    grass: [0.62, 0.64, 0.58],
    grassDensity: 0.15,
    embers: false,
    ashFog: false,
    snow: true,
  },
};

/** Ground within this many metres above the water table darkens toward wet peat (Greyfen). */
export const WET_BAND = 2.5;
/** Snow starts at SNOW_LINE metres and is full by SNOW_FULL; slopes steeper than about 40 degrees (normal y 0.77) hold none. */
export const SNOW_LINE = 400;
export const SNOW_FULL = 480;
export const SNOW_COLOR: readonly [number, number, number] = [0.8, 0.84, 0.9];

interface Area {
  key: GroundKey;
  box: ShapeBox;
  reach: ShapeBox;
}

const AREAS: readonly Area[] = REGION_IDS.filter((id) => isGroundKey(REGION_INFO[id].ground)).map((id: RegionId) => {
  const b = engineBox(id);
  const box = { minX: b.x0, maxX: b.x1, minZ: b.z0, maxZ: b.z1 };
  return { key: REGION_INFO[id].ground as GroundKey, box, reach: grow(box, GROUND_BLEND) };
});

function isGroundKey(k: string | null): k is GroundKey {
  return k === 'cinderreach' || k === 'oldsmoke' || k === 'greyfen' || k === 'dragonspine';
}

function grow(b: ShapeBox, m: number): ShapeBox {
  return { minX: b.minX - m, maxX: b.maxX + m, minZ: b.minZ - m, maxZ: b.maxZ + m };
}

function smoothstep(a: number, b: number, x: number): number {
  const t = Math.min(Math.max((x - a) / (b - a), 0), 1);
  return t * t * (3 - 2 * t);
}

function boxDistance(b: ShapeBox, x: number, z: number): number {
  const dx = x < b.minX ? b.minX - x : x > b.maxX ? x - b.maxX : 0;
  const dz = z < b.minZ ? b.minZ - z : z > b.maxZ ? z - b.maxZ : 0;
  return Math.sqrt(dx * dx + dz * dz);
}

const inBox = (b: ShapeBox, x: number, z: number) => x >= b.minX && x <= b.maxX && z >= b.minZ && z <= b.maxZ;

/**
 * The pass road crosses the 1.5 km gap between Cinderreach's box and Oldsmoke's. Over the gap (where the two boxes
 * share x) the ground cross-fades from Cinderreach to Oldsmoke along z, so it never turns back to Act 1 green.
 */
const BRIDGE = (() => {
  const c = AREAS.find((a) => a.key === 'cinderreach')?.box;
  const o = AREAS.find((a) => a.key === 'oldsmoke')?.box;
  if (!c || !o || o.minZ <= c.maxZ) return null;
  const box = { minX: Math.max(c.minX, o.minX), maxX: Math.min(c.maxX, o.maxX), minZ: c.maxZ, maxZ: o.minZ };
  return { box, reach: { ...box, minX: box.minX - GROUND_BLEND, maxX: box.maxX + GROUND_BLEND } };
})();

/** Each ground rule's weight at (x, z): 1 inside its region, 0 beyond GROUND_BLEND (bridged across the pass). Pure. */
export function groundWeights(x: number, z: number): Record<GroundKey, number> {
  return weightsInto({ cinderreach: 0, oldsmoke: 0, greyfen: 0, dragonspine: 0 }, x, z);
}

function weightsInto(w: Record<GroundKey, number>, x: number, z: number): Record<GroundKey, number> {
  w.cinderreach = 0;
  w.oldsmoke = 0;
  w.greyfen = 0;
  w.dragonspine = 0;
  for (const a of AREAS) {
    if (!inBox(a.reach, x, z)) continue;
    w[a.key] = Math.max(w[a.key], 1 - smoothstep(0, GROUND_BLEND, boxDistance(a.box, x, z)));
  }
  if (BRIDGE && inBox(BRIDGE.reach, x, z)) {
    const b = BRIDGE.box;
    const across = 1 - smoothstep(0, GROUND_BLEND, x < b.minX ? b.minX - x : x > b.maxX ? x - b.maxX : 0);
    const t = smoothstep(b.minZ, b.maxZ, z);
    w.cinderreach = Math.max(w.cinderreach, across * (1 - t));
    w.oldsmoke = Math.max(w.oldsmoke, across * t);
  }
  return w;
}

/**
 * The origin a chunk's material must sample, or null where no rule reaches it. One material per origin, picked per
 * chunk (not per vertex): the origin of the region whose box the chunk centre is nearest, among those the chunk
 * touches. A chunk is at most 3.2 km wide and every point of a region's reach is within 4 km of its origin, so the
 * local coordinate stays small. Where two origins meet (the Act 2 pass bridge, the world edge) the pattern is simply
 * continuous within each chunk: the seam is a pattern phase change inside a blend band, never a precision loss. Pure.
 */
export function groundOriginFor(cx: number, cz: number, size: number): GroundOriginKey | null {
  const h = size / 2;
  let best: GroundOriginKey | null = null;
  let bestD = Infinity;
  for (const a of AREAS) {
    if (!overlaps(a.reach, cx - h, cx + h, cz - h, cz + h)) continue;
    const d = boxDistance(a.box, cx, cz);
    if (d < bestD) {
      bestD = d;
      best = ORIGIN_OF[a.key];
    }
  }
  if (BRIDGE && overlaps(BRIDGE.reach, cx - h, cx + h, cz - h, cz + h) && boxDistance(BRIDGE.box, cx, cz) < bestD) best = 'act2';
  return best;
}

const overlaps = (b: ShapeBox, minX: number, maxX: number, minZ: number, maxZ: number) => b.minX < maxX && b.maxX > minX && b.minZ < maxZ && b.maxZ > minZ;

/** Whether any ground rule reaches the square chunk centred on (cx, cz): Act 1 chunks answer false. Pure. */
export function chunkTouchesGround(cx: number, cz: number, size: number): boolean {
  const h = size / 2;
  const reaches = [...AREAS.map((a) => a.reach), ...(BRIDGE ? [BRIDGE.reach] : [])];
  return reaches.some((r) => overlaps(r, cx - h, cx + h, cz - h, cz + h));
}

// ---- masks: roads and plateaus carry no seams, fog or spoil (A1's own polylines and boxes, never a second heightAt)

interface RoadSeg {
  ax: number;
  az: number;
  bx: number;
  bz: number;
  half: number;
  aabb: ShapeBox;
}
const ROAD_MASK_FADE = 10;
const ROAD_SEGS: readonly RoadSeg[] = ACT2_ROADS.flatMap((r) =>
  r.points.slice(1).map((b, i) => {
    const a = r.points[i];
    const m = r.halfWidth + 4 + ROAD_MASK_FADE;
    return { ax: a.x, az: a.z, bx: b.x, bz: b.z, half: r.halfWidth + 4, aabb: { minX: Math.min(a.x, b.x) - m, maxX: Math.max(a.x, b.x) + m, minZ: Math.min(a.z, b.z) - m, maxZ: Math.max(a.z, b.z) + m } };
  }),
);
const PLATEAU_BOXES: readonly ShapeBox[] = ACT2_PLATEAUS.map((p) => grow(p.box, 20));

function maskOver(segs: readonly RoadSeg[], plateaus: readonly ShapeBox[], x: number, z: number): number {
  for (const b of plateaus) if (inBox(b, x, z)) return 0;
  let m = 1;
  for (const s of segs) {
    if (!inBox(s.aabb, x, z)) continue;
    const dx = s.bx - s.ax;
    const dz = s.bz - s.az;
    const t = Math.max(0, Math.min(1, ((x - s.ax) * dx + (z - s.az) * dz) / (dx * dx + dz * dz)));
    const ex = s.ax + dx * t - x;
    const ez = s.az + dz * t - z;
    const d = Math.sqrt(ex * ex + ez * ez);
    m = Math.min(m, smoothstep(s.half, s.half + ROAD_MASK_FADE, d));
    if (m === 0) return 0;
  }
  return m;
}

/** 1 on open ground, 0 on a road (its bed plus 4 m) or a plateau, a 10 m fade at a road's edge. Pure. */
export function openGroundMask(x: number, z: number): number {
  return maskOver(ROAD_SEGS, PLATEAU_BOXES, x, z);
}

// ---- colour

const spoilNoise = createNoise2D(4421);

/** Oldsmoke's spoil patches: 0..1, sampled region-local. Pure. */
export function spoilMask(x: number, z: number): number {
  const lx = x - ACT2_GROUND_ORIGIN.x;
  const lz = z - ACT2_GROUND_ORIGIN.z;
  return smoothstep(0.35, 0.6, spoilNoise(lx / 140, lz / 140));
}

const peatNoise = createNoise2D(5107);

/** Greyfen's wet peat patches: 0..1, sampled Greyfen-local. Pure. */
export function peatMask(x: number, z: number): number {
  const lx = x - GREYFEN_GROUND_ORIGIN.x;
  const lz = z - GREYFEN_GROUND_ORIGIN.z;
  return smoothstep(0.1, 0.45, peatNoise(lx / 110, lz / 110));
}

/** 1 at the water table, 0 from WET_BAND metres above it: the soil's darkening toward the water. Pure. */
export function wetWeight(h: number): number {
  return 1 - smoothstep(GREYFEN_WATER_TABLE, GREYFEN_WATER_TABLE + WET_BAND, h);
}

/** Snow cover (0..1) at height h on ground of normal y `up`: from SNOW_LINE, full by SNOW_FULL, none past about 40 degrees. Pure. */
export function snowWeight(h: number, up: number): number {
  return smoothstep(SNOW_LINE, SNOW_FULL, h) * smoothstep(0.77, 0.86, up);
}

/** Tints `out[o..]` by the weights `w`; `mask` is the open-ground mask at (x, z), or -1 to compute it from the lists. `h` is NaN when unknown. */
function tint(w: Record<GroundKey, number>, x: number, z: number, h: number, up: number, segs: readonly RoadSeg[], plateaus: readonly ShapeBox[], out: Float32Array, o: number): number {
  let mask = -1;
  const rock = Math.min(Math.max((0.82 - up) / 0.12, 0), 1);
  for (const key of ['cinderreach', 'oldsmoke', 'greyfen', 'dragonspine'] as const) {
    const k = w[key];
    if (k <= 0) continue;
    const rule = GROUND_RULES[key];
    let r = rule.soil[0] + (rule.rock[0] - rule.soil[0]) * rock;
    let g = rule.soil[1] + (rule.rock[1] - rule.soil[1]) * rock;
    let b = rule.soil[2] + (rule.rock[2] - rule.soil[2]) * rock;
    if (rule.spoil) {
      const sp = spoilMask(x, z);
      if (sp > 0 && mask < 0) mask = maskOver(segs, plateaus, x, z);
      const s = sp > 0 ? sp * mask : 0;
      r += (rule.spoil[0] - r) * s;
      g += (rule.spoil[1] - g) * s;
      b += (rule.spoil[2] - b) * s;
    }
    if (rule.peat) {
      // Wet peat patches, and a darker soil within WET_BAND of the water table (skipped when the height is unknown).
      const pm = peatMask(x, z) * 0.85;
      r += (rule.peat[0] - r) * pm;
      g += (rule.peat[1] - g) * pm;
      b += (rule.peat[2] - b) * pm;
      const wet = Number.isFinite(h) ? wetWeight(h) * 0.5 : 0;
      r *= 1 - wet;
      g *= 1 - wet;
      b *= 1 - wet;
    }
    if (rule.snow && Number.isFinite(h)) {
      const sn = snowWeight(h, up);
      r += (SNOW_COLOR[0] - r) * sn;
      g += (SNOW_COLOR[1] - g) * sn;
      b += (SNOW_COLOR[2] - b) * sn;
    }
    out[o] += (r - out[o]) * k;
    out[o + 1] += (g - out[o + 1]) * k;
    out[o + 2] += (b - out[o + 2]) * k;
  }
  return mask;
}

/**
 * Blends the Act 1 colour already at `out[o..o+2]` (from `surfaceColor`) toward each region's soil (open ground) and
 * rock (steep ground) by its weight at (x, z), for a normal y of `up`. Leaves it untouched where every weight is 0.
 */
export function groundColor(x: number, z: number, up: number, out: Float32Array, o: number, h = Number.NaN): void {
  tint(groundWeights(x, z), x, z, h, up, ROAD_SEGS, PLATEAU_BOXES, out, o);
}

/** A grass tuft's base colour and kept fraction at (x, z): Act 1's when every weight is 0. Pure. */
export function grassRule(x: number, z: number): { tint: readonly [number, number, number] | null; weight: number; density: number } {
  const w = groundWeights(x, z);
  let key: GroundKey = 'cinderreach';
  for (const c of ['oldsmoke', 'greyfen', 'dragonspine'] as const) if (w[c] > w[key]) key = c;
  const k = w[key];
  if (k <= 0) return { tint: null, weight: 0, density: 1 };
  const rule = GROUND_RULES[key];
  return { tint: rule.grass, weight: k, density: 1 + (rule.grassDensity - 1) * k };
}

/** Forge-glass vein weight (before the shader's pattern): Dragonspine's weight on bare rock, none under snow. Pure. */
export function veinWeight(x: number, z: number, h: number, up: number): number {
  const k = groundWeights(x, z).dragonspine;
  return k > 0 ? k * (1 - snowWeight(h, up)) : 0;
}

/** Ember-seam weight (before the shader's pattern): Cinderreach's weight on gentle open ground. Pure. */
export function emberWeight(x: number, z: number, up: number): number {
  const k = groundWeights(x, z).cinderreach;
  if (k <= 0) return 0;
  return k * smoothstep(0.86, 0.95, up) * openGroundMask(x, z);
}

// ---- ash-fog in the dips: a world-aligned lattice of heights, box-filtered, so neighbouring chunks agree on their edge

export const DIP_LATTICE = 32;
/** Box filter half width in lattice cells (3 x 32 = 96 m). */
export const DIP_RADIUS_CELLS = 3;
/** Metres below the local mean at which a dip is fully fogged. */
export const DIP_DEPTH = 16;
/** Chunks larger than this get no dips: the fog fades out by 1.1 km, well inside them. */
export const DIP_MAX_CHUNK = 800;

export interface DipField {
  /** The lattice mean height at (x, z), bilinear between nodes. */
  meanAt(x: number, z: number): number;
}

/**
 * The local mean heights over the square (cx, cz, size): `heightAt` once per 32 m node over the square plus the filter
 * radius, then a separable box filter. Nodes are on the world grid, so two chunks sharing an edge get the same means.
 */
export function buildDipField(cx: number, cz: number, size: number, heightAt: (x: number, z: number) => number): DipField {
  const S = DIP_LATTICE;
  const R = DIP_RADIUS_CELLS;
  const i0 = Math.floor((cx - size / 2) / S) - R;
  const j0 = Math.floor((cz - size / 2) / S) - R;
  const i1 = Math.ceil((cx + size / 2) / S) + R;
  const j1 = Math.ceil((cz + size / 2) / S) + R;
  const nx = i1 - i0 + 1;
  const nz = j1 - j0 + 1;
  const h = new Float64Array(nx * nz);
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) h[j * nx + i] = heightAt((i0 + i) * S, (j0 + j) * S);
  // Separable box filter; edges use what exists (only nodes R or more inside are read below).
  const tmp = new Float64Array(nx * nz);
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      let sum = 0;
      let n = 0;
      for (let k = Math.max(0, i - R); k <= Math.min(nx - 1, i + R); k++, n++) sum += h[j * nx + k];
      tmp[j * nx + i] = sum / n;
    }
  }
  const mean = new Float64Array(nx * nz);
  for (let i = 0; i < nx; i++) {
    for (let j = 0; j < nz; j++) {
      let sum = 0;
      let n = 0;
      for (let k = Math.max(0, j - R); k <= Math.min(nz - 1, j + R); k++, n++) sum += tmp[k * nx + i];
      mean[j * nx + i] = sum / n;
    }
  }
  return {
    meanAt(x, z) {
      const fx = Math.min(Math.max(x / S - i0, 0), nx - 1.000001);
      const fz = Math.min(Math.max(z / S - j0, 0), nz - 1.000001);
      const i = Math.floor(fx);
      const j = Math.floor(fz);
      const tx = fx - i;
      const tz = fz - j;
      const a = mean[j * nx + i] + (mean[j * nx + i + 1] - mean[j * nx + i]) * tx;
      const b = mean[(j + 1) * nx + i] + (mean[(j + 1) * nx + i + 1] - mean[(j + 1) * nx + i]) * tx;
      return a + (b - a) * tz;
    },
  };
}

/** Ash-fog weight at a vertex: how far it sits below the local mean, on Cinderreach's open ground. Pure. */
export function ashFogWeight(x: number, z: number, h: number, field: DipField): number {
  const k = groundWeights(x, z).cinderreach;
  if (k <= 0) return 0;
  return k * smoothstep(0, DIP_DEPTH, field.meanAt(x, z) - h) * openGroundMask(x, z);
}

// ---- per chunk: one pass per vertex, with the road and plateau lists cut down to the chunk once

export interface ChunkGround {
  /**
   * Tints the Act 1 colour at `colors[o..o+2]` and writes the ember and ash-fog weights at `ground[g]`, `ground[g+1]`
   * for the vertex at (x, z) of height `h` and normal y `up`. Same results as groundColor, emberWeight, ashFogWeight.
   */
  vertex(x: number, z: number, h: number, up: number, colors: Float32Array, o: number, ground: Float32Array, g: number): void;
}

/** The ground of the square chunk (cx, cz, size), or null where no rule reaches it. */
export function chunkGround(cx: number, cz: number, size: number, heightAt: (x: number, z: number) => number): ChunkGround | null {
  if (!chunkTouchesGround(cx, cz, size)) return null;
  const hs = size / 2;
  const segs = ROAD_SEGS.filter((s) => overlaps(s.aabb, cx - hs, cx + hs, cz - hs, cz + hs));
  const plateaus = PLATEAU_BOXES.filter((b) => overlaps(b, cx - hs, cx + hs, cz - hs, cz + hs));
  const dips = size <= DIP_MAX_CHUNK ? buildDipField(cx, cz, size, heightAt) : null;
  // In a Dragonspine chunk the `ground.x` channel carries the vein weight, not the ember weight (the shader's uGroundVein).
  const veins = groundOriginFor(cx, cz, size) === 'dragonspine';
  const w: Record<GroundKey, number> = { cinderreach: 0, oldsmoke: 0, greyfen: 0, dragonspine: 0 };
  return {
    vertex(x, z, h, up, colors, o, ground, g) {
      weightsInto(w, x, z);
      let mask = tint(w, x, z, h, up, segs, plateaus, colors, o);
      if (veins) {
        ground[g] = w.dragonspine > 0 ? w.dragonspine * (1 - snowWeight(h, up)) : 0;
        ground[g + 1] = 0;
        return;
      }
      const k = w.cinderreach;
      if (k <= 0) {
        ground[g] = 0;
        ground[g + 1] = 0;
        return;
      }
      const flat = smoothstep(0.86, 0.95, up);
      const dip = dips ? smoothstep(0, DIP_DEPTH, dips.meanAt(x, z) - h) : 0;
      if ((flat > 0 || dip > 0) && mask < 0) mask = maskOver(segs, plateaus, x, z);
      ground[g] = flat > 0 ? k * flat * mask : 0;
      ground[g + 1] = dip > 0 ? k * dip * mask : 0;
    },
  };
}
