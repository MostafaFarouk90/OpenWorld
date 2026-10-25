// Where the environment pass owns the ground cover. The meadow GrassField (src/region/grass.ts) scatters its own blades everywhere;
// a built tile's grass clumps and flower patches normally sit on top of them. A tile that must keep its ground clear of blades (B1's
// lane and green) opts in below. This gives the region plugin one predicate: is (x, z) inside a tile that replaces the blades?
import { LAZY_TILES, TILE_BOUNDS, TILES, type TileRect } from './tiles';
import { laneAmount } from '../terrain/shape/detailGround';
import { SPLAT_CLEAR, splatClearAmount } from '../terrain/shape/groundSplat';
import { classOf, type PlacementRow } from './PlacementField';
import { CROWD_LANES, HARROWMARK_LAYOUT } from '../harrowmark/harrowmark.layout';
import { pointInFootprint } from '../region/geometry';

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
 * True where a built tile listed in `owners` replaces the meadow grass with its own rows, on B1's lane and on the Harrowmark trodden streets and packed yards (groundSplat.ts SPLAT_CLEAR). Always false when `envOn` is false
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
    .flatMap(([, rows]) => groundCoverRects(rows));
  return (x, z) => laneAmount(x, z) >= LANE_CLEAR || splatClearAmount(x, z) >= SPLAT_CLEAR || rects.some((r) => x >= r.minX && x <= r.maxX && z >= r.minZ && z <= r.maxZ);
}

/**
 * Lawn inside Harrowmark's walls where the meadow blades grow again, by tile. The city is blade-free as a whole (region.plugin
 * CITY_NO_GRASS_RADIUS: the streets, yards and plazas are not meadow), but the wards' lawns are, and without blades they read as bare
 * green felt at eye height. A Harrowmark tile adopts the lawn by adding its core here when its builder dresses it (H1 now; H2, H3 and
 * H4 add a line). Kept off, whatever the table says: crowd lanes (CROWD_LANES half widths), Harrowmark footprints, the M06 gate square
 * (CITY_LAWN_KEEP_OUT), the trodden streets and packed yards (envOwnsGround), static colliders (grassAcceptFor's physics probe) and
 * everything with `?env=off`.
 */
export const CITY_LAWN: Readonly<Record<string, readonly Rect[]>> = {
  h1: [{ minX: 7760, maxX: 9240, minZ: 1120, maxZ: 1440 }],
  // H3: the keep and the Rooftop Ward, the L shape x 7720..9240, z 1960..2760 minus H4 (x 7720..8440, z 1960..2240).
  h3: [
    { minX: 7720, maxX: 9240, minZ: 2240, maxZ: 2760 },
    { minX: 8440, maxX: 9240, minZ: 1960, maxZ: 2240 },
  ],
};
/** Rectangles inside a lawn tile that stay bare: the M06 gate square (patrol box plus 8 m) and the gate passage. */
export const CITY_LAWN_KEEP_OUT: readonly Rect[] = [
  { minX: 8462, maxX: 8538, minZ: 1262, maxZ: 1328 },
  { minX: 8494, maxX: 8506, minZ: 1180, maxZ: 1262 },
];

/**
 * The lawn's mix: sparser (35% of the meadow's tufts) and drier (65% of the way to straw) than the meadow outside, so the wards read as
 * trodden ground with blades through it, not a fresh meadow (sheet section 5: inside the wall, clumps and dry tufts on the trodden remainder).
 */
export const CITY_LAWN_MIX = { keep: 0.35, dry: 0.65 } as const;

/** The mix at (x, z): CITY_LAWN_MIX where the lawn grows inside the city radius, else null (the meadow's own tufts). */
export function cityLawnMixFor(lawn: (x: number, z: number) => boolean, inCity: (x: number, z: number) => boolean): (x: number, z: number) => { keep: number; dry: number } | null {
  return (x, z) => (inCity(x, z) && lawn(x, z) ? CITY_LAWN_MIX : null);
}

/** True where blades may grow inside the city radius (see CITY_LAWN). Always false with `?env=off`. */
export function cityLawnFor(
  envOn: boolean,
  lawn: Readonly<Record<string, readonly Rect[]>> = CITY_LAWN,
  keepOut: readonly Rect[] = CITY_LAWN_KEEP_OUT,
): (x: number, z: number) => boolean {
  if (!envOn) return () => false;
  const rects = Object.values(lawn).flat();
  const solids = HARROWMARK_LAYOUT.structures.filter((s) => s.mode !== 'open').map((st) => ({ st, reach: Math.hypot(st.footprint[0], st.footprint[1]) / 2 + 0.4 }));
  const at = (id: string): readonly [number, number] => {
    const an = HARROWMARK_LAYOUT.anchors.find((a) => a.id === id)!;
    return [an.x, an.z];
  };
  const lanes = CROWD_LANES.map((l) => ({ hw: l.halfWidth, loop: l.loop, pts: l.points.map(at) }));
  const inRect = (r: Rect, x: number, z: number): boolean => x >= r.minX && x <= r.maxX && z >= r.minZ && z <= r.maxZ;
  return (x, z) =>
    rects.some((r) => inRect(r, x, z)) &&
    !keepOut.some((r) => inRect(r, x, z)) &&
    !solids.some(({ st, reach }) => Math.abs(x - st.x) <= reach && Math.abs(z - st.z) <= reach && pointInFootprint(st, x, z, 0.6)) &&
    !lanes.some((l) => polyDist(l.pts, l.loop, x, z) < l.hw);
}

function polyDist(pts: ReadonlyArray<readonly [number, number]>, loop: boolean, x: number, z: number): number {
  let best = Infinity;
  const n = loop ? pts.length : pts.length - 1;
  for (let i = 0; i < n; i++) {
    const [ax, az] = pts[i]!;
    const [bx, bz] = pts[(i + 1) % pts.length]!;
    const dx = bx - ax;
    const dz = bz - az;
    const len2 = dx * dx + dz * dz;
    const t = len2 > 0 ? Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / len2)) : 0;
    best = Math.min(best, Math.hypot(x - (ax + t * dx), z - (az + t * dz)));
  }
  return best;
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
  const rects = Object.entries(bounds).flatMap(([name, rs]) => ((tiles[name]?.length ?? 0) > 0 || (tiles === TILES && name in LAZY_TILES) ? rs : []));
  return (x, z) => rects.some((r) => x >= r.minX && x <= r.maxX && z >= r.minZ && z <= r.maxZ);
}
