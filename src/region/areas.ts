// Sub-area bands (contracts v0.7 item 1, plan Part 3.1 and 3.7 item 7): an area is a box inside a region with its own
// level band and span, read by the spawners before the region band. The Greyfen is one area (its block lock rolls a
// span of 5 on top of L); the Dragonspine splits into the lower slopes (span 2 on top of L) and the summit (the design's
// fixed 26 to 28, capped by the player's level in `levelFor`, Q9). Boxes are engine metres, min inclusive, max exclusive.
import { engineBox, type MapBox, type RegionId } from './regions';
import type { LevelBand } from '../enemies/types';

export type AreaId =
  | 'greyfen'
  | 'dragonspine-lower'
  | 'dragonspine-summit'
  | 'harrowmark-a4'
  | 'caldera-rim'
  | 'caldera-stair'
  | 'caldera-terraces'
  | 'caldera-foundry'
  | 'caldera-anvil'
  | 'caldera-siege';

export interface AreaDef {
  region: RegionId;
  /** Engine box; `null` means the whole region box minus the other areas of the region (the lower slopes). */
  box: MapBox | null;
  /** Levels this area spawns at when no block lock applies (the summit always uses it). */
  band: LevelBand;
  /** Levels rolled on top of a block's base level L (design 5.9: L to L + span). */
  span: number;
  /**
   * v0.8: a named-only area has no ground of its own (Act 4's interiors float at their doors' x, z): `areaAt` never answers
   * it, and only a spawner (or wave set) that names it uses its band.
   */
  namedOnly?: boolean;
  /**
   * v0.9: the region whose kill XP factor a member of this area pays, whatever box it stands in (a spawner naming
   * `caldera-rim` on the rim stairs, inside the Waste's box, pays the Caldera's x 3.0). Absent: the region at the point.
   */
  killXpRegion?: RegionId;
}

/** The summit box (an invented box, plan 3.1): engine x 11500..16500, z 14800..16900; south of the world edge (17000). */
export const SUMMIT_BOX: MapBox = { x0: 11500, z0: 14800, x1: 16500, z1: 16900 };

export const AREA_BANDS: Readonly<Record<AreaId, AreaDef>> = {
  greyfen: { region: 'greyfen', box: null, band: { min: 18, max: 23 }, span: 5 },
  'dragonspine-lower': { region: 'dragonspine', box: null, band: { min: 20, max: 22 }, span: 2 },
  'dragonspine-summit': { region: 'dragonspine', box: SUMMIT_BOX, band: { min: 26, max: 28 }, span: 2 },
  // v0.8 (Act 4): the Council Chamber, the Keep stairs, the Crucible Cellars and the deep run, 28 to 33, capped (Q1).
  'harrowmark-a4': { region: 'harrowmark', box: null, band: { min: 28, max: 33 }, span: 0, namedOnly: true },
  // v0.9 (Act 5, plan 3.1): the bowl's sub-bands, named only (the bowl is round and the rim stairs leave the Caldera box).
  // Every spawner and wave set in the Caldera names one (act5Areas.test.ts lints it); all are capped (ACT5_CAP_ABOVE_PLAYER)
  // and pay the Caldera's kill XP factor.
  'caldera-rim': { region: 'caldera', box: null, band: { min: 35, max: 36 }, span: 0, namedOnly: true, killXpRegion: 'caldera' },
  'caldera-stair': { region: 'caldera', box: null, band: { min: 35, max: 37 }, span: 0, namedOnly: true, killXpRegion: 'caldera' },
  'caldera-terraces': { region: 'caldera', box: null, band: { min: 36, max: 37 }, span: 0, namedOnly: true, killXpRegion: 'caldera' },
  'caldera-foundry': { region: 'caldera', box: null, band: { min: 37, max: 39 }, span: 0, namedOnly: true, killXpRegion: 'caldera' },
  'caldera-anvil': { region: 'caldera', box: null, band: { min: 39, max: 40 }, span: 0, namedOnly: true, killXpRegion: 'caldera' },
  'caldera-siege': { region: 'caldera', box: null, band: { min: 37, max: 37 }, span: 0, namedOnly: true, killXpRegion: 'caldera' },
};

/** v0.9: the Caldera's named areas (every one is capped at P + 3 and pays the Caldera's factor). */
export const CALDERA_AREA_IDS: readonly AreaId[] = ['caldera-rim', 'caldera-stair', 'caldera-terraces', 'caldera-foundry', 'caldera-anvil', 'caldera-siege'];

export function isCalderaArea(v: unknown): boolean {
  return typeof v === 'string' && (CALDERA_AREA_IDS as readonly string[]).includes(v);
}

export const AREA_IDS = Object.keys(AREA_BANDS) as AreaId[];

const inBox = (b: MapBox, x: number, z: number): boolean => x >= b.x0 && x < b.x1 && z >= b.z0 && z < b.z1;

/** The area at an engine point: boxed areas first, then a region-wide area of the region the point is in. */
export function areaAt(x: number, z: number): AreaId | null {
  if (!Number.isFinite(x) || !Number.isFinite(z)) return null;
  for (const id of AREA_IDS) {
    const b = AREA_BANDS[id].box;
    if (b && !AREA_BANDS[id].namedOnly && inBox(b, x, z)) return id;
  }
  for (const id of AREA_IDS) {
    const a = AREA_BANDS[id];
    if (!a.box && !a.namedOnly && inBox(engineBox(a.region), x, z)) return id;
  }
  return null;
}

export function isAreaId(v: unknown): v is AreaId {
  return typeof v === 'string' && Object.prototype.hasOwnProperty.call(AREA_BANDS, v);
}
