// District-block nav grids for Harrowmark (slice 2 thread 3a, Phase B plan section 8). Pure: no Three, no Rapier.
// Engine metres, +Z north. The rects avoid one another, so a goal in another block is never a step away.
import type { StructureSpec } from '../../region/layoutTypes';
import type { NavGridDef, NavOrientedRect, NavRect } from '../NavGrid';

export interface CityNavBlock {
  /** Grid id `city.<id>`. */
  id: string;
  rect: NavRect;
}

/** Streets where hostiles fight on foot: M07's cutpurses and R03's thugs, Forge Row, the Bastion yard (M07), the South Gate (M06). */
export const CITY_NAV_BLOCKS: readonly CityNavBlock[] = [
  // The market ring, the stalls, the thieves' alley and the guildhall's south front.
  { id: 'guild-quarter', rect: { x0: 8705, z0: 1465, x1: 9065, z1: 1590 } },
  { id: 'forge-row', rect: { x0: 8080, z0: 1460, x1: 8300, z1: 1590 } },
  // From the Tilted Anvil's back wall to the Bastion hall's front (the yard fence has no collider).
  { id: 'bastion-yard', rect: { x0: 8120, z0: 1686, x1: 8290, z1: 1795 } },
  // Inside the ring wall: the gate passage and the portcullis stay outside the grid, so its state never matters here.
  { id: 'south-gate', rect: { x0: 8410, z0: 1256, x1: 8590, z1: 1400 } },
];

/** Outdoor cells are 1 m: the streets are 4 m or wider, and it keeps every block small. */
export const CITY_NAV_CELL = 1;
/** Each block's cell count stays under this (a 0.5 m interior grid like the Underways is 24k). */
export const MAX_BLOCK_CELLS = 120_000;
/** A block whose ground varies more than this is skipped: a grid has one flat floor. */
export const MAX_BLOCK_GROUND_SPREAD = 0.6;
/** Ground samples are this far apart (plus the far edges). */
const SAMPLE_STEP = 4;

/** Footprints grow by half a cell, so a walkable cell centre is never closer than that to a wall (clearance stays honest). */
export function footprintRect(s: StructureSpec, pad = CITY_NAV_CELL / 2): NavOrientedRect {
  return { cx: s.x, cz: s.z, hx: s.footprint[0] / 2 + pad, hz: s.footprint[1] / 2 + pad, yaw: (s.yawDeg * Math.PI) / 180 };
}

/** Structures that block walking on the street: anything with a collider (enterable ones count whole), not rooftop props. */
export function blocksStreet(s: StructureSpec): boolean {
  return s.mode !== 'open' && !s.inside;
}

const overlaps = (o: NavOrientedRect, r: NavRect): boolean => {
  const c = Math.abs(Math.cos(o.yaw));
  const s = Math.abs(Math.sin(o.yaw));
  const ex = o.hx * c + o.hz * s;
  const ez = o.hx * s + o.hz * c;
  return o.cx + ex > r.x0 && o.cx - ex < r.x1 && o.cz + ez > r.z0 && o.cz - ez < r.z1;
};

export type BlockGridResult = { def: NavGridDef } | { skipped: string };

/** The grid def for one block, or why it is skipped (uneven ground). Throws when the block breaks the cell cap. */
export function blockGridDef(
  block: CityNavBlock,
  structures: readonly StructureSpec[],
  heightAt: (x: number, z: number) => number,
): BlockGridResult {
  const { rect } = block;
  const cells = Math.ceil((rect.x1 - rect.x0) / CITY_NAV_CELL) * Math.ceil((rect.z1 - rect.z0) / CITY_NAV_CELL);
  if (cells > MAX_BLOCK_CELLS) throw new Error(`city nav block "${block.id}": ${cells} cells is over the cap of ${MAX_BLOCK_CELLS}`);
  let min = Infinity;
  let max = -Infinity;
  let bad = false;
  const sample = (x: number, z: number): void => {
    const h = heightAt(x, z);
    if (!Number.isFinite(h)) bad = true;
    if (h < min) min = h;
    if (h > max) max = h;
  };
  for (let x = rect.x0; x < rect.x1; x += SAMPLE_STEP) {
    for (let z = rect.z0; z < rect.z1; z += SAMPLE_STEP) sample(x, z);
    sample(x, rect.z1);
  }
  for (let z = rect.z0; z < rect.z1; z += SAMPLE_STEP) sample(rect.x1, z);
  sample(rect.x1, rect.z1);
  if (bad) return { skipped: 'the terrain gave a non-finite height' };
  if (!(max - min <= MAX_BLOCK_GROUND_SPREAD)) {
    return { skipped: `ground varies ${(max - min).toFixed(2)} m (over ${MAX_BLOCK_GROUND_SPREAD} m)` };
  }
  const blockedOriented = structures.filter(blocksStreet).map((s) => footprintRect(s)).filter((o) => overlaps(o, rect));
  return {
    def: {
      id: `city.${block.id}`,
      minX: rect.x0,
      minZ: rect.z0,
      maxX: rect.x1,
      maxZ: rect.z1,
      // The highest ground: feet stand on it, and the 2.5 m band still keeps the rooftops (6 m and up) out.
      floorY: max,
      cellSize: CITY_NAV_CELL,
      walkable: [rect],
      blockedOriented,
    },
  };
}
