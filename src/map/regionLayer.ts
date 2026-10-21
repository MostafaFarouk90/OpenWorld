// Region labels and closed-region fog for the full map (A15). Pure: the plugin passes the open set from
// `containment.openRegions()`; the view draws what this returns. A closed region (reserved, or built but not yet open) is
// shaded and reads only "Unknown lands", so Act 1's map never names Act 2.
import { REGION_IDS, REGION_INFO, engineBox, type MapBox, type RegionId } from '../region/regions';

export interface RegionChip {
  id: RegionId;
  /** Engine-space box (min inclusive, max exclusive). */
  box: MapBox;
  /** Chip centre, engine metres. */
  x: number;
  z: number;
  closed: boolean;
  /** `map.region.<id>` for an open region, `map.region.unknown` for a closed one. */
  labelKey: string;
}

export const UNKNOWN_REGION_KEY = 'map.region.unknown';

function inside(inner: MapBox, outer: MapBox): boolean {
  return inner.x0 >= outer.x0 && inner.x1 <= outer.x1 && inner.z0 >= outer.z0 && inner.z1 <= outer.z1;
}

/**
 * One chip per region. A region whose box sits wholly inside another's (the Caldera inside the Ashen Waste) gets no
 * chip of its own, so labels never stack; its area is still shaded through the outer box while closed.
 */
export function regionChips(open: readonly RegionId[]): RegionChip[] {
  const openSet = new Set(open);
  const out: RegionChip[] = [];
  for (const id of REGION_IDS) {
    const box = engineBox(id);
    const nested = REGION_IDS.some((other) => {
      if (other === id) return false;
      const ob = engineBox(other);
      // Identical boxes cannot happen; a strict containment keeps the outer one.
      return inside(box, ob) && !inside(ob, box);
    });
    if (nested) continue;
    const closed = REGION_INFO[id].reserved || !openSet.has(id);
    out.push({
      id,
      box,
      x: (box.x0 + box.x1) / 2,
      z: (box.z0 + box.z1) / 2,
      closed,
      labelKey: closed ? UNKNOWN_REGION_KEY : `map.region.${id}`,
    });
  }
  return out;
}

/** Stable signature, so the view redraws its region layer only when the open set changes. */
export function chipsKey(chips: readonly RegionChip[]): string {
  return chips.map((c) => `${c.id}${c.closed ? 0 : 1}`).join('|');
}

/** The open region a point is in (registry order; null between regions), for the minimap caption. */
export function openRegionAt(x: number, z: number, open: readonly RegionId[]): RegionId | null {
  if (!Number.isFinite(x) || !Number.isFinite(z)) return null;
  for (const id of open) {
    if (REGION_INFO[id].reserved) continue;
    const b = engineBox(id);
    if (x >= b.x0 && x < b.x1 && z >= b.z0 && z < b.z1) return id;
  }
  return null;
}
