// The filter build-tile-rows.ts applies to a designer file: the owner-tile rule (core rows only) plus the frozen layout keep-outs.
import { BRIGHTWATER_LAYOUT } from '../../src/region/brightwater.layout';
import { CORRIDOR_LAYOUT } from '../../src/region/corridor.layout';
import { DENSITY_LAYOUT_A } from '../../src/region/density.layout';
import { pointInFootprint } from '../../src/region/geometry';
import type { PlacementRow } from '../../src/env/PlacementField';

export interface DesignerRow extends PlacementRow {
  note?: string;
}

/** Margin (m) around a solid structure's footprint that nothing may use. */
export const MARGIN = 0.4;
/** Nothing but ground cover within this distance (m) of an anchor. */
export const ANCHOR_CLEAR = 1.0;

const LAYOUTS = [BRIGHTWATER_LAYOUT, CORRIDOR_LAYOUT, DENSITY_LAYOUT_A];
const solids = LAYOUTS.flatMap((l) => l.structures).filter((s) => s.mode !== 'open');
const anchors = LAYOUTS.flatMap((l) => l.anchors);
const ground = (id: string): boolean => /^(grass|flower)/.test(id);

/** Runtime rows (id, x, z, yaw, scale) of a designer file: rows inside `core` (all rows when none) that clear the keep-outs. */
export function filterTileRows(
  placements: readonly DesignerRow[],
  core?: { x: readonly [number, number]; z: readonly [number, number] },
): { rows: PlacementRow[]; inCore: number; dropped: Record<string, number> } {
  const inside = core ? placements.filter((r) => r.x >= core.x[0] && r.x <= core.x[1] && r.z >= core.z[0] && r.z <= core.z[1]) : [...placements];
  const dropped: Record<string, number> = {};
  const rows = inside
    .filter((r) => {
      const s = solids.find((st) => pointInFootprint(st, r.x, r.z, MARGIN));
      if (s) return void (dropped[`in ${s.id}`] = (dropped[`in ${s.id}`] ?? 0) + 1);
      const a = ground(r.id) ? undefined : anchors.find((an) => Math.hypot(r.x - an.x, r.z - an.z) < ANCHOR_CLEAR);
      if (a) return void (dropped[`near ${a.id}`] = (dropped[`near ${a.id}`] ?? 0) + 1);
      return true;
    })
    .map(({ id, x, z, yaw, scale }) => ({ id, x, z, yaw, scale }));
  return { rows, inCore: inside.length, dropped };
}
