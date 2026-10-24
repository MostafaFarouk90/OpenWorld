// Where the environment pass owns the ground cover. The meadow GrassField (src/region/grass.ts) scatters its own blades everywhere;
// inside a built tile the placement rows already carry grass clumps and flower patches, so both together read as sparse pale blades
// doubled up on the clumps. This gives the region plugin one predicate: is (x, z) inside a tile that dresses its own ground?
import { TILE_BOUNDS, TILES, type TileRect } from './tiles';
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

/** Ground rows closer than this (m, in grid cells) belong to the same dressed area; a tile with an annex far away gets two. */
export const GROUND_COVER_LINK = 48;

/**
 * Bounding rectangles of a tile's ground-class rows, one per connected area (rows bucketed into GROUND_COVER_LINK cells, cells
 * touching on a side or a corner joined), so a tile plus a distant annex does not claim all the meadow between them. An area with
 * fewer than GROUND_COVER_MIN_ROWS ground rows is ignored.
 */
export function groundCoverRects(rows: readonly PlacementRow[], margin = GROUND_COVER_MARGIN, link = GROUND_COVER_LINK): Rect[] {
  const cells = new Map<string, PlacementRow[]>();
  for (const row of rows) {
    if (classOf(row.id) !== 'ground') continue;
    const k = `${Math.floor(row.x / link)},${Math.floor(row.z / link)}`;
    (cells.get(k) ?? cells.set(k, []).get(k)!).push(row);
  }
  const seen = new Set<string>();
  const out: Rect[] = [];
  for (const start of cells.keys()) {
    if (seen.has(start)) continue;
    seen.add(start);
    const members: PlacementRow[] = [];
    const stack = [start];
    while (stack.length) {
      const k = stack.pop()!;
      members.push(...cells.get(k)!);
      const [cx, cz] = k.split(',').map(Number);
      for (let dx = -1; dx <= 1; dx++)
        for (let dz = -1; dz <= 1; dz++) {
          const n = `${cx + dx},${cz + dz}`;
          if (cells.has(n) && !seen.has(n)) {
            seen.add(n);
            stack.push(n);
          }
        }
    }
    const r = groundCoverRect(members, margin);
    if (r) out.push(r);
  }
  return out;
}

/**
 * Tiles whose clumps sit on top of the game's meadow blades instead of replacing them. B2's wide pastures have no lane or green to
 * keep clear, and the blades are what makes a standing eye see grass at 1 to 10 m; its clumps read as the patchy long grass among them.
 */
export const KEEP_MEADOW_BLADES: ReadonlySet<string> = new Set(['b2']);

/**
 * True where a built tile's placement rows replace the meadow grass. Always false when `envOn` is false (`?env=off`), so the old
 * grass comes back with the dressing out. Rects are computed once from the registered tiles.
 */
export function envOwnsGround(envOn: boolean, tiles: Readonly<Record<string, readonly PlacementRow[]>> = TILES): (x: number, z: number) => boolean {
  if (!envOn) return () => false;
  const rects = Object.entries(tiles)
    .filter(([name]) => !KEEP_MEADOW_BLADES.has(name))
    .flatMap(([, rows]) => groundCoverRects(rows));
  return (x, z) => rects.some((r) => x >= r.minX && x <= r.maxX && z >= r.minZ && z <= r.maxZ);
}

/**
 * True inside a built tile's own bounds (TILE_BOUNDS), where its rows replace the corridor's old verge posts and reed cards. Only
 * tiles that are registered (have rows) count, and it is always false when `envOn` is false (`?env=off`), so the old scenery
 * comes back with the dressing out.
 */
export function envReplacesScenery(
  envOn: boolean,
  bounds: Readonly<Record<string, readonly TileRect[]>> = TILE_BOUNDS,
  tiles: Readonly<Record<string, readonly PlacementRow[]>> = TILES,
): (x: number, z: number) => boolean {
  if (!envOn) return () => false;
  const rects = Object.entries(bounds).flatMap(([name, rs]) => ((tiles[name]?.length ?? 0) > 0 ? rs : []));
  return (x, z) => rects.some((r) => x >= r.minX && x <= r.maxX && z >= r.minZ && z <= r.maxZ);
}
