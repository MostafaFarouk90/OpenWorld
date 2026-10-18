// Map tuning constants. Engine independent; the DOM view and plugin read these.
import { WORLD_BOUNDS } from '../config/constants';

export interface WorldBounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

/** Slice 1 world: a 4 km square centred on the origin. Saved `map` v1 fog is on this extent. */
export const LEGACY_V1_BOUNDS: Readonly<WorldBounds> = Object.freeze({ minX: -2000, maxX: 2000, minZ: -2000, maxZ: 2000 });

/**
 * The one world extent (slice 2): a copy of core WORLD_BOUNDS (src/config/constants.ts). Covers the farm-ring (6800, 900), the fog
 * wall (1100, -150) and Harrowmark. Origin (-2000, -2000) equals the v1 origin and cells stay 50 m, so old
 * fog cells map 1:1 into the new grid. Final numbers come from thread 11's terrain size.
 */
export const DEFAULT_WORLD_BOUNDS: Readonly<WorldBounds> = Object.freeze({ ...WORLD_BOUNDS });

export const MAP_TUNING = {
  /** Full-map terrain bitmap resolution (pixels per edge). */
  fullMapPixels: 256,
  /** Minimap local tile resolution (pixels per edge). */
  minimapTilePixels: 128,
  /** Metres per minimap pixel (128 px * 2.5 = 320 m across). */
  minimapMetresPerPixel: 2.5,
  /** Fog-of-discovery cell edge in metres. */
  fogCellSize: 50,
  /** Radius around the player that gets revealed, metres. */
  revealRadius: 150,
  /** Time budget per bitmap slice, milliseconds. */
  bitmapSliceBudgetMs: 4,
  /** Minimap redraw rate in Hz. */
  minimapRedrawHz: 2,
  /** Fog reveal rate in Hz (plan: each second). */
  fogRevealHz: 1,
  /** Pixel radius within which a click selects a marker. */
  markerHitRadiusPx: 10,
  /** Cached terrain bitmaps kept at most. */
  cacheMaxEntries: 4,
  /** Sun direction for hillshade (towards the light), not required to be normalised. */
  sunDirection: { x: -0.5, y: 0.7, z: -0.5 },
  /** Vertical exaggeration applied to slopes for readable shading. */
  hillshadeExaggeration: 3,
} as const;

/** Height tint ramp: [metres, r, g, b], ascending by height, linearly interpolated. */
export const HEIGHT_TINT_STOPS: ReadonlyArray<readonly [number, number, number, number]> = [
  [-90, 38, 70, 110],
  [-2, 60, 105, 140],
  [0, 112, 148, 84],
  [40, 98, 138, 72],
  [150, 150, 150, 92],
  [300, 140, 112, 82],
  [450, 128, 122, 118],
  [640, 244, 244, 248],
];
