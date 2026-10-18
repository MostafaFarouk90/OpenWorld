// Hillshade + height tint bitmaps as raw RGBA pixel arrays. No DOM or canvas use.
// Rendering is a generator: each `next()` runs one time-bounded slice, so callers can spread the
// work over frames (one slice per frame) and tests can drive it with a simulated clock.

import { HEIGHT_TINT_STOPS, MAP_TUNING, type WorldBounds } from './tuning';

export type HeightSampler = (x: number, z: number) => number;

export interface BitmapOptions {
  bounds: WorldBounds;
  width: number;
  height: number;
  /** Per-slice time budget in ms. Default MAP_TUNING.bitmapSliceBudgetMs. */
  budgetMs?: number;
  /** Clock in ms (inject for tests). Default performance.now / Date.now. */
  now?: () => number;
}

export interface TerrainBitmap {
  width: number;
  height: number;
  bounds: WorldBounds;
  /** RGBA, row-major, row 0 at bounds.minZ, column 0 at bounds.minX. */
  pixels: Uint8ClampedArray;
}

export interface SliceProgress {
  /** Fraction of pixels done, 0..1. */
  progress: number;
  /** Pixels rendered in the slice that just finished. */
  pixelsInSlice: number;
}

const defaultNow = (): number =>
  typeof performance !== 'undefined' && typeof performance.now === 'function' ? performance.now() : Date.now();

/** Height tint colour for a height in metres. Writes r, g, b into out[0..2]. */
export function tintForHeight(h: number, out: number[] | Float64Array): void {
  const s = HEIGHT_TINT_STOPS;
  if (!(h > s[0]![0])) {
    out[0] = s[0]![1];
    out[1] = s[0]![2];
    out[2] = s[0]![3];
    return;
  }
  for (let i = 1; i < s.length; i++) {
    const hi = s[i]!;
    if (h <= hi[0]) {
      const lo = s[i - 1]!;
      const t = (h - lo[0]) / (hi[0] - lo[0]);
      out[0] = lo[1] + (hi[1] - lo[1]) * t;
      out[1] = lo[2] + (hi[2] - lo[2]) * t;
      out[2] = lo[3] + (hi[3] - lo[3]) * t;
      return;
    }
  }
  const last = s[s.length - 1]!;
  out[0] = last[1];
  out[1] = last[2];
  out[2] = last[3];
}

/**
 * Time-sliced render. Yields a SliceProgress after each slice and returns the finished bitmap.
 * A slice stops before the next pixel when (elapsed + the slowest pixel seen so far) would exceed
 * the budget, but always renders at least one pixel so it makes progress. The result is identical
 * to a single-pass render regardless of how the work is sliced.
 */
export function* renderTerrainBitmap(
  sample: HeightSampler,
  opts: BitmapOptions,
): Generator<SliceProgress, TerrainBitmap, void> {
  const { bounds, width, height } = opts;
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) {
    throw new RangeError('width and height must be positive integers');
  }
  const budget = opts.budgetMs ?? MAP_TUNING.bitmapSliceBudgetMs;
  const now = opts.now ?? defaultNow;
  const pixels = new Uint8ClampedArray(width * height * 4);
  const total = width * height;
  const dx = (bounds.maxX - bounds.minX) / width;
  const dz = (bounds.maxZ - bounds.minZ) / height;
  const sun = MAP_TUNING.sunDirection;
  const sl = Math.hypot(sun.x, sun.y, sun.z);
  const lx = sun.x / sl;
  const ly = sun.y / sl;
  const lz = sun.z / sl;
  const ex = MAP_TUNING.hillshadeExaggeration;
  const rgb = [0, 0, 0];

  let i = 0;
  while (i < total) {
    const sliceStart = now();
    let slowest = 0;
    let done = 0;
    while (i < total) {
      const t0 = now();
      if (done > 0 && t0 - sliceStart + slowest > budget) break;
      const col = i % width;
      const row = (i - col) / width;
      // Sample at the pixel centre; slopes from forward differences one pixel apart.
      const x = bounds.minX + (col + 0.5) * dx;
      const z = bounds.minZ + (row + 0.5) * dz;
      const h = sample(x, z);
      const hx = sample(x + dx, z);
      const hz = sample(x, z + dz);
      const sx = ((hx - h) / dx) * ex;
      const sz = ((hz - h) / dz) * ex;
      const nl = Math.hypot(sx, 1, sz);
      const lambert = (-sx * lx + ly - sz * lz) / nl;
      // Flat ground (lambert = ly) maps to 1.0; slopes facing the sun brighten, away darken.
      const shade = Math.min(1.35, Math.max(0.45, (lambert / ly) * 0.95 + 0.05));
      tintForHeight(h, rgb);
      const o = i * 4;
      pixels[o] = rgb[0]! * shade;
      pixels[o + 1] = rgb[1]! * shade;
      pixels[o + 2] = rgb[2]! * shade;
      pixels[o + 3] = 255;
      i++;
      done++;
      const cost = now() - t0;
      if (cost > slowest) slowest = cost;
    }
    yield { progress: i / total, pixelsInSlice: done };
  }
  return { width, height, bounds: { ...bounds }, pixels };
}

/** Run a render generator to completion in one go (tests, worker fallbacks). */
export function drain<T>(gen: Generator<unknown, T, void>): T {
  for (;;) {
    const r = gen.next();
    if (r.done) return r.value;
  }
}

export interface LocalTileOptions {
  /** Pixels per edge. Default MAP_TUNING.minimapTilePixels. */
  pixels?: number;
  /** Metres per pixel. Default MAP_TUNING.minimapMetresPerPixel. */
  metresPerPixel?: number;
  budgetMs?: number;
  now?: () => number;
}

/** World bounds of the minimap tile centred on (cx, cz), snapped to the pixel grid to avoid shimmer. */
export function localTileBounds(
  cx: number,
  cz: number,
  pixels: number = MAP_TUNING.minimapTilePixels,
  metresPerPixel: number = MAP_TUNING.minimapMetresPerPixel,
): WorldBounds {
  const half = (pixels * metresPerPixel) / 2;
  const sx = Math.round(cx / metresPerPixel) * metresPerPixel;
  const sz = Math.round(cz / metresPerPixel) * metresPerPixel;
  return { minX: sx - half, maxX: sx + half, minZ: sz - half, maxZ: sz + half };
}

/** Minimap variant: a square tile centred on the player. */
export function renderLocalTile(
  sample: HeightSampler,
  cx: number,
  cz: number,
  opts: LocalTileOptions = {},
): Generator<SliceProgress, TerrainBitmap, void> {
  const pixels = opts.pixels ?? MAP_TUNING.minimapTilePixels;
  return renderTerrainBitmap(sample, {
    bounds: localTileBounds(cx, cz, pixels, opts.metresPerPixel),
    width: pixels,
    height: pixels,
    budgetMs: opts.budgetMs,
    now: opts.now,
  });
}

/** Cache key by (terrain version, bounds, resolution). */
export function bitmapCacheKey(terrainVersion: string | number, bounds: WorldBounds, width: number, height: number): string {
  return `${terrainVersion}|${bounds.minX},${bounds.maxX},${bounds.minZ},${bounds.maxZ}|${width}x${height}`;
}
