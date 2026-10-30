// The tiles the environment pass has built, by name. Each tile's rows come from its designer's placement file (plans/env-pass/<tile>).
// b3.placements.json is B3's core rows plus its reed-island annex (55, -300), built by tools/env-pass/build-tile-rows.ts --annex.
import b1 from './b1.placements.json';
import b1Enclosure from './b1.enclosure.json';
import b2 from './b2.placements.json';
import b3 from './b3.placements.json';
import b4 from './b4.placements.json';
import h1 from './h1.placements.json';
import h1Litter from './h1.litter.json';
import h1Dressing from './h1.dressing.json';
import h2 from './h2.placements.json';
import h2Dressing from './h2.dressing.json';
import h3 from './h3.placements.json';
import h3Dressing from './h3.dressing.json';
import h4 from './h4.placements.json';
import h4Dressing from './h4.dressing.json';
import type { PlacementRow } from './PlacementField';

export const TILES: Record<string, readonly PlacementRow[]> = {
  b1: [...(b1 as PlacementRow[]), ...(b1Enclosure as PlacementRow[])],
  // B2: north meadow, waystone and east farmland. Owns core x 0..260, z -20..330 outside B1's core, plus the west seam x -100..0, z 230..330.
  b2: b2 as PlacementRow[],
  b3: b3 as PlacementRow[],
  // B4: the Quenchstone Shrine and the east road (x 700..1100, z -300..200); the 28 x 28 m hearth pad at (995,-168) stays empty.
  b4: b4 as PlacementRow[],
  // H1: Harrowmark's south gate and outer ward (x 7760..9240, z 1120..1440), a 1,480 m wide one-off for the city (ruling 2026-10-24).
  // Plus the builder's rim, camp and paddock dressing (gen-dressing.ts) and the M06 yard litter (tools/env-pass/h1/gen-yard-litter.ts): weeds, dry tufts and pebbles on the packed yards.
  h1: [...(h1 as PlacementRow[]), ...(h1Litter as PlacementRow[]), ...(h1Dressing as PlacementRow[])],
  // H2: main street and market (core x 8440..9240, z 1440..1960; H1 wins the z 1440 edge, H2 wins x 8440 and z 1960).
  // Plus the builder's middle-ground dressing at the designer's eye cameras (tools/env-pass/h2/round2.ts).
  h2: [...(h2 as PlacementRow[]), ...(h2Dressing as PlacementRow[])],
  // H3: the keep and the Rooftop Ward (L shape x 7720..9240, z 1960..2760 minus H4; 1,520 m wide, a ruled exemption). The core rows are on the
  // ground; the ward-deck annex (the designer's separate h3.ward-deck file, built with --deck) is appended and its rows carry `dy`
  // (they stand on the Rooftop Ward roofs and chimneys).
  // Plus the round-2 rim dressing of the trimmed courts and the middle-ground groups (tools/env-pass/h3/round2.ts).
  h3: [...(h3 as PlacementRow[]), ...(h3Dressing as PlacementRow[])],
  // H4: Forge Row and the chapel (core x 7720..8440, z 1440..2240; H1 wins the z 1440 edge, H2 and H3 the x 8440 edge). The soot ground is in H3's splat file.
  // Plus the builder's middle-ground dressing at the designer's eye cameras and the enclosure gate closing (tools/env-pass/h4/round2.ts).
  h4: [...(h4 as PlacementRow[]), ...(h4Dressing as PlacementRow[])],
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
