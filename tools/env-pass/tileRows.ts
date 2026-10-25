// The filter build-tile-rows.ts applies to a designer file: the owner-tile rule (core rows only) plus the frozen layout keep-outs.
import { BRIGHTWATER_LAYOUT } from '../../src/region/brightwater.layout';
import { CORRIDOR_LAYOUT } from '../../src/region/corridor.layout';
import { DENSITY_LAYOUT_A } from '../../src/region/density.layout';
import { pointInFootprint } from '../../src/region/geometry';
import { HARROWMARK_LAYOUT } from '../../src/harrowmark/harrowmark.layout';
import { DEADROAD_LAYOUT } from '../../src/region/deadroad.layout';
import type { LayoutData } from '../../src/region/layoutTypes';
import type { PlacementRow } from '../../src/env/PlacementField';

export interface DesignerRow extends PlacementRow {
  note?: string;
}

/** A reserved pad (designer meta.reserved): empty flat ground, no row of any class within PAD_CLEAR of the box. */
export interface ReservedPad { id: string; x: number; z: number; halfW: number; halfD: number }
export const PAD_CLEAR = 2;

/** Margin (m) around a solid structure's footprint that nothing may use. */
export const MARGIN = 0.4;
/** Nothing but ground cover within this distance (m) of an anchor. */
export const ANCHOR_CLEAR = 1.0;

/** The frozen layouts a tile is checked against: Brightwater's by default, or Harrowmark's city plus the Dead Road (`--layout harrowmark`). */
export const LAYOUT_SETS: Readonly<Record<string, readonly LayoutData[]>> = {
  brightwater: [BRIGHTWATER_LAYOUT, CORRIDOR_LAYOUT, DENSITY_LAYOUT_A],
  harrowmark: [HARROWMARK_LAYOUT, DEADROAD_LAYOUT],
};
const ground = (id: string): boolean => /^(grass|flower)/.test(id);

/** Runtime rows (id, x, z, yaw, scale) of a designer file: rows inside `core` (all rows when none) that clear the keep-outs. */
export function filterTileRows(
  placements: readonly DesignerRow[],
  core?: { x: readonly [number, number]; z: readonly [number, number] },
  also: ReadonlyArray<readonly [number, number, number, number]> = [],
  pads: ReadonlyArray<ReservedPad> = [],
  layouts: readonly LayoutData[] = LAYOUT_SETS.brightwater!,
): { rows: PlacementRow[]; inCore: number; dropped: Record<string, number> } {
  const inCore = (r: DesignerRow): boolean => !core || (r.x >= core.x[0] && r.x <= core.x[1] && r.z >= core.z[0] && r.z <= core.z[1]);
  const inside = placements.filter((r) => inCore(r) || also.some(([x0, x1, z0, z1]) => r.x >= x0 && r.x < x1 && r.z > z0 && r.z <= z1));
  const solids = layouts.flatMap((l) => l.structures).filter((s) => s.mode !== 'open');
  const anchors = layouts.flatMap((l) => l.anchors);
  const dropped: Record<string, number> = {};
  const rows = inside
    .filter((r) => {
      const pad = pads.find((p) => Math.abs(r.x - p.x) <= p.halfW + PAD_CLEAR && Math.abs(r.z - p.z) <= p.halfD + PAD_CLEAR);
      if (pad) return void (dropped[`in ${pad.id}`] = (dropped[`in ${pad.id}`] ?? 0) + 1);
      const s = solids.find((st) => pointInFootprint(st, r.x, r.z, MARGIN));
      if (s) return void (dropped[`in ${s.id}`] = (dropped[`in ${s.id}`] ?? 0) + 1);
      const a = ground(r.id) ? undefined : anchors.find((an) => Math.hypot(r.x - an.x, r.z - an.z) < ANCHOR_CLEAR);
      if (a) return void (dropped[`near ${a.id}`] = (dropped[`near ${a.id}`] ?? 0) + 1);
      return true;
    })
    .map(({ id, x, z, yaw, scale }) => ({ id, x, z, yaw, scale }));
  return { rows, inCore: inside.length, dropped };
}
