// Region mask stub (design section 15 item 42): Brightwater only. Other regions answer null until
// the world design lands. Boxes are written in design "map" metres (24 km by 18 km world) and
// converted to engine metres, where the tutorial spawn is the origin.

export type RegionId = 'brightwater';

export interface RegionInfo {
  id: RegionId;
  levelBand: { min: number; max: number };
  track: string;
}

/** engine = map + offset. Brightwater's box starts at map (500, 500), which lands 500 m before the origin. */
export const MAP_TO_ENGINE_OFFSET = { x: -1000, z: -1000 } as const;

/** Map-space boxes (min inclusive, max exclusive). */
export const REGION_BOXES_MAP: Record<RegionId, { x0: number; z0: number; x1: number; z1: number }> = {
  brightwater: { x0: 500, z0: 500, x1: 6500, z1: 5500 },
};

const REGION_INFO: Record<RegionId, Omit<RegionInfo, 'id'>> = {
  brightwater: { levelBand: { min: 1, max: 9 }, track: 'barley-and-brazier' },
};

export function regionAt(x: number, z: number): RegionInfo | null {
  if (!Number.isFinite(x) || !Number.isFinite(z)) return null;
  const mx = x - MAP_TO_ENGINE_OFFSET.x;
  const mz = z - MAP_TO_ENGINE_OFFSET.z;
  for (const id of Object.keys(REGION_BOXES_MAP) as RegionId[]) {
    const b = REGION_BOXES_MAP[id];
    if (mx >= b.x0 && mx < b.x1 && mz >= b.z0 && mz < b.z1) {
      const info = REGION_INFO[id];
      return { id, levelBand: { ...info.levelBand }, track: info.track };
    }
  }
  return null;
}
