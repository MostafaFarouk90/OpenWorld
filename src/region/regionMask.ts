// Region mask (design section 15 item 42). Since v0.6 the boxes, bands and tracks live in the region registry
// (regions.ts); this module keeps the v0.5 API. Between Brightwater and Harrowmark (engine x 5500..6500) lies the
// null corridor, and every point outside a built region answers null. Reserved regions (later acts) never answer.
import { MAP_TO_ENGINE_OFFSET, REGION_IDS, REGION_INFO, type MapBox, type RegionId } from './regions';

export { MAP_TO_ENGINE_OFFSET };
export type { RegionId };

export interface RegionInfo {
  id: RegionId;
  levelBand: { min: number; max: number };
  track: string;
}

/** Map-space boxes (min inclusive, max exclusive), every region including the reserved ones. */
export const REGION_BOXES_MAP: Readonly<Record<RegionId, MapBox>> = Object.fromEntries(
  REGION_IDS.map((id) => [id, REGION_INFO[id].box]),
) as Record<RegionId, MapBox>;

const BUILT: readonly RegionId[] = REGION_IDS.filter((id) => !REGION_INFO[id].reserved);

export function regionAt(x: number, z: number): RegionInfo | null {
  if (!Number.isFinite(x) || !Number.isFinite(z)) return null;
  const mx = x - MAP_TO_ENGINE_OFFSET.x;
  const mz = z - MAP_TO_ENGINE_OFFSET.z;
  for (const id of BUILT) {
    const b = REGION_INFO[id].box;
    if (mx >= b.x0 && mx < b.x1 && mz >= b.z0 && mz < b.z1) {
      const info = REGION_INFO[id];
      return { id, levelBand: { ...info.levelBand }, track: info.track };
    }
  }
  return null;
}
