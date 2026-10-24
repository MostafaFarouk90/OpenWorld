// The tiles the environment pass has built, by name. Each tile's rows come from its designer's placement file (plans/env-pass/<tile>).
// b3.placements.json is B3's core rows plus its reed-island annex (55, -300), built by tools/env-pass/build-tile-rows.ts --annex.
import b1 from './b1.placements.json';
import b1Enclosure from './b1.enclosure.json';
import b2 from './b2.placements.json';
import b3 from './b3.placements.json';
import b4 from './b4.placements.json';
import type { PlacementRow } from './PlacementField';

export const TILES: Record<string, readonly PlacementRow[]> = {
  b1: [...(b1 as PlacementRow[]), ...(b1Enclosure as PlacementRow[])],
  // B2: north meadow, waystone and east farmland. Owns core x 0..260, z -20..330 outside B1's core, plus the west seam x -100..0, z 230..330.
  b2: b2 as PlacementRow[],
  b3: b3 as PlacementRow[],
  // B4: the Quenchstone Shrine and the east road (x 700..1100, z -300..200); the 28 x 28 m hearth pad at (995,-168) stays empty.
  b4: b4 as PlacementRow[],
};

/**
 * Tiles loaded on demand: their rows are separate chunks (dynamic import), not part of the main bundle. D1 to D3 are the Dead Road
 * corridor, x 1100..8000, 2 MB of JSON that no player needs at the start. D1 x 1100..3600 (the grey reach and the thaw), D2 x 3600..6000
 * (the heath, the Footman camps and the marches), D3 x 6000..8000 (the farm-ring; east of x 7760 only south of z 1120, where H1
 * starts). Rows with a grass-patch-* id are clumps: PlacementField expands each into 6 to 14 tufts (src/env/patches.ts).
 */
export const LAZY_TILES: Record<string, () => Promise<readonly PlacementRow[]>> = {
  d1: () => import('./d1.placements.json').then((m) => m.default as PlacementRow[]),
  d2: () => import('./d2.placements.json').then((m) => m.default as PlacementRow[]),
  d3: () => import('./d3.placements.json').then((m) => m.default as PlacementRow[]),
};

export interface TileRect {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

/**
 * Ground a built tile owns outright (its core, plus any annex a ruling gave it). Inside these the older scenery the tile replaces
 * (src/region/corridorScenery.ts reed cards and verge posts) is left out while the pass is on.
 */
export const TILE_BOUNDS: Record<string, readonly TileRect[]> = {
  b3: [
    { minX: -480, maxX: -60, minZ: -310, maxZ: 60 },
    { minX: 25, maxX: 85, minZ: -335, maxZ: -265 },
  ],
  // D1 to D3: the 600 m strip round the Dead Road; the old verge posts east of the fog wall go (the tiles carry milestones and verges).
  d1: [{ minX: 1100, maxX: 3600, minZ: -449, maxZ: 947 }],
  d2: [{ minX: 3600, maxX: 6000, minZ: 352, maxZ: 1179 }],
  d3: [{ minX: 6000, maxX: 8000, minZ: 466, maxZ: 1209 }],
};
export type { PlacementRow };
