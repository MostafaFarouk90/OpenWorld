// Sub-area bands (contracts v0.7 item 1, plan Part 3.1 and 3.7 item 7): an area is a box inside a region with its own
// level band and span, read by the spawners before the region band. The Greyfen is one area (its block lock rolls a
// span of 5 on top of L); the Dragonspine splits into the lower slopes (span 2 on top of L) and the summit (the design's
// fixed 26 to 28, capped by the player's level in `levelFor`, Q9). Boxes are engine metres, min inclusive, max exclusive.
import { engineBox, type MapBox, type RegionId } from './regions';
import type { LevelBand } from '../enemies/types';

export type AreaId = 'greyfen' | 'dragonspine-lower' | 'dragonspine-summit';

export interface AreaDef {
  region: RegionId;
  /** Engine box; `null` means the whole region box minus the other areas of the region (the lower slopes). */
  box: MapBox | null;
  /** Levels this area spawns at when no block lock applies (the summit always uses it). */
  band: LevelBand;
  /** Levels rolled on top of a block's base level L (design 5.9: L to L + span). */
  span: number;
}

/** The summit box (an invented box, plan 3.1): engine x 11500..16500, z 14800..16900; south of the world edge (17000). */
export const SUMMIT_BOX: MapBox = { x0: 11500, z0: 14800, x1: 16500, z1: 16900 };

export const AREA_BANDS: Readonly<Record<AreaId, AreaDef>> = {
  greyfen: { region: 'greyfen', box: null, band: { min: 18, max: 23 }, span: 5 },
  'dragonspine-lower': { region: 'dragonspine', box: null, band: { min: 20, max: 22 }, span: 2 },
  'dragonspine-summit': { region: 'dragonspine', box: SUMMIT_BOX, band: { min: 26, max: 28 }, span: 2 },
};

export const AREA_IDS = Object.keys(AREA_BANDS) as AreaId[];

const inBox = (b: MapBox, x: number, z: number): boolean => x >= b.x0 && x < b.x1 && z >= b.z0 && z < b.z1;

/** The area at an engine point: boxed areas first, then a region-wide area of the region the point is in. */
export function areaAt(x: number, z: number): AreaId | null {
  if (!Number.isFinite(x) || !Number.isFinite(z)) return null;
  for (const id of AREA_IDS) {
    const b = AREA_BANDS[id].box;
    if (b && inBox(b, x, z)) return id;
  }
  for (const id of AREA_IDS) {
    const a = AREA_BANDS[id];
    if (!a.box && inBox(engineBox(a.region), x, z)) return id;
  }
  return null;
}

export function isAreaId(v: unknown): v is AreaId {
  return typeof v === 'string' && Object.prototype.hasOwnProperty.call(AREA_BANDS, v);
}
