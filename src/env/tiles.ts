// The tiles the environment pass has built, by name. Each tile's rows come from its designer's placement file (plans/env-pass/<tile>).
// b3.placements.json is B3's core rows plus its reed-island annex (55, -300), built by tools/env-pass/build-tile-rows.ts --annex.
import b1 from './b1.placements.json';
import b1Enclosure from './b1.enclosure.json';
import b3 from './b3.placements.json';
import type { PlacementRow } from './PlacementField';

export const TILES: Record<string, readonly PlacementRow[]> = {
  b1: [...(b1 as PlacementRow[]), ...(b1Enclosure as PlacementRow[])],
  b3: b3 as PlacementRow[],
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
};
export type { PlacementRow };
