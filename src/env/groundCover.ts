// Where the environment pass owns the ground cover. The meadow GrassField (src/region/grass.ts) scatters its own blades everywhere;
// inside a built tile the placement rows already carry grass clumps and flower patches, so both together read as sparse pale blades
// doubled up on the clumps. This gives the region plugin one predicate: is (x, z) inside a tile that dresses its own ground?
import { TILES } from './tiles';
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
 * True where a built tile's placement rows replace the meadow grass. Always false when `envOn` is false (`?env=off`), so the old
 * grass comes back with the dressing out. Rects are computed once from the registered tiles.
 */
export function envOwnsGround(envOn: boolean, tiles: Readonly<Record<string, readonly PlacementRow[]>> = TILES): (x: number, z: number) => boolean {
  if (!envOn) return () => false;
  const rects = Object.values(tiles)
    .map((rows) => groundCoverRect(rows))
    .filter((r): r is Rect => r !== null);
  return (x, z) => rects.some((r) => x >= r.minX && x <= r.maxX && z >= r.minZ && z <= r.maxZ);
}
