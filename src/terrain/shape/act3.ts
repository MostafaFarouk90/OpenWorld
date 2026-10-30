// Act 3 thread K1: the Act 3 terrain features as lists (siblings and tests read them; the world shape lists them itself),
// and the shipped ground no Act 3 flat, uplift or trough may reach.
import { REGION_INFO, engineBox, type RegionId } from '../../region/regions';
import type { PlateauDef, RoadDef, ShapeBox } from '../shaping';
import { DRAGONSPINE_PLATEAUS, DRAGONSPINE_ROADS } from './dragonspine';
import { GREYFEN_PLATEAUS, GREYFEN_ROADS } from './greyfen';

export const ACT3_PLATEAUS: readonly PlateauDef[] = [...GREYFEN_PLATEAUS, ...DRAGONSPINE_PLATEAUS];
export const ACT3_ROADS: readonly RoadDef[] = [...GREYFEN_ROADS, ...DRAGONSPINE_ROADS];

/** Regions whose ground is shipped (Acts 1 and 2) or reserved for Act 4: no Act 3 flat, uplift or trough reaches them. */
export const ACT3_PROTECTED_REGIONS: readonly RegionId[] = ['brightwater', 'harrowmark', 'cinderreach', 'oldsmoke', 'ashen-waste'];

export const ACT3_PROTECTED_BOXES: readonly ShapeBox[] = ACT3_PROTECTED_REGIONS.map((id) => {
  if (!REGION_INFO[id]) throw new Error(`act3 shape: unknown region "${id}"`);
  const b = engineBox(id);
  return { minX: b.x0, maxX: b.x1, minZ: b.z0, maxZ: b.z1 };
});

/** The kill plane (-50, Player.ts) plus 10 m: no trough, pool or bowl floor may be this low or lower. */
export const ACT3_MIN_FLOOR = -40;
