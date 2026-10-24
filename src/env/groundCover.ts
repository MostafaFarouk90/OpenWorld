// Where the environment pass owns the ground cover. The meadow GrassField (src/region/grass.ts) scatters its own blades everywhere;
// a built tile's grass clumps and flower patches normally sit on top of them. A tile that must keep its ground clear of blades (B1's
// lane and green) opts in below. This gives the region plugin one predicate: is (x, z) inside a tile that replaces the blades?
import { TILES } from './tiles';
import { laneAmount } from '../terrain/shape/detailGround';
import { classOf, type PlacementRow } from './PlacementField';

export interface Rect {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

/** Margin (m) added around the ground-cover rows, about one clump spacing, so the blades do not ring the edge of the clumps. */
export const GROUND_COVER_MARGIN = 6;
/** A tile needs at least this many ground rows to own its ground cover (a lone flower patch does not). */
export const GROUND_COVER_MIN_ROWS = 20;

/** Bounding rectangle of a tile's ground-class rows, or null when it has too few to dress the ground. */
export function groundCoverRect(rows: readonly PlacementRow[], margin = GROUND_COVER_MARGIN): Rect | null {
  let n = 0;
  const r: Rect = { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity };
  for (const row of rows) {
    if (classOf(row.id) !== 'ground') continue;
    n++;
    r.minX = Math.min(r.minX, row.x);
    r.maxX = Math.max(r.maxX, row.x);
    r.minZ = Math.min(r.minZ, row.z);
    r.maxZ = Math.max(r.maxZ, row.z);
  }
  if (n < GROUND_COVER_MIN_ROWS) return null;
  return { minX: r.minX - margin, maxX: r.maxX + margin, minZ: r.minZ - margin, maxZ: r.maxZ + margin };
}

/**
 * Tiles whose placement rows replace the game's meadow blades outright. None does now: B1 was the last, and its meadow eye shot read
 * bare with the blades off (round 5). Only B1's packed-earth lane stays clear of blades (LANE_CLEAR below), since the blades would
 * otherwise grow across it. Every tile lays its clumps on top of the blades. The blades are what a standing eye sees as grass at 1 to
 * 10 m: a grass clump model is about 0.45 m across, so even 600 clumps within 30 m of a camera cover only a few per cent of the ground.
 * Turning the blades off across a whole tile (B4 round 3: x 700..1100) left lone tufts on bare ground at eye height, however many
 * rows the tile had. Opt in here only for ground that must stay bare.
 */
export const OWNS_GROUND_COVER: ReadonlySet<string> = new Set<string>();
/** No meadow blades where B1's lane covers at least this much of the ground (terrain/shape/detailGround.ts laneAmount). */
export const LANE_CLEAR = 0.15;

/**
 * True where a built tile listed in `owners` replaces the meadow grass with its own rows, and on B1's lane. Always false when `envOn` is false
 * (`?env=off`), so the old grass comes back with the dressing out. Rects are computed once from the registered tiles.
 */
export function envOwnsGround(
  envOn: boolean,
  tiles: Readonly<Record<string, readonly PlacementRow[]>> = TILES,
  owners: ReadonlySet<string> = OWNS_GROUND_COVER,
): (x: number, z: number) => boolean {
  if (!envOn) return () => false;
  const rects = Object.entries(tiles)
    .filter(([name]) => owners.has(name))
    .map(([, rows]) => groundCoverRect(rows))
    .filter((r): r is Rect => r !== null);
  return (x, z) => laneAmount(x, z) >= LANE_CLEAR || rects.some((r) => x >= r.minX && x <= r.maxX && z >= r.minZ && z <= r.maxZ);
}
