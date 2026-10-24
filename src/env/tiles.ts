// The tiles the environment pass has built, by name. Each tile's rows come from its designer's placement file (plans/env-pass/<tile>).
import b1 from './b1.placements.json';
import b1Enclosure from './b1.enclosure.json';
import b2 from './b2.placements.json';
import b4 from './b4.placements.json';
import type { PlacementRow } from './PlacementField';

export const TILES: Record<string, readonly PlacementRow[]> = {
  b1: [...(b1 as PlacementRow[]), ...(b1Enclosure as PlacementRow[])],
  // B2: north meadow, waystone and east farmland. Owns core x 0..260, z -20..330 outside B1's core, plus the west seam x -100..0, z 230..330.
  b2: b2 as PlacementRow[],
  // B4: the Quenchstone Shrine and the east road (x 700..1100, z -300..200); the 28 x 28 m hearth pad at (995,-168) stays empty.
  b4: b4 as PlacementRow[],
};
export type { PlacementRow };
