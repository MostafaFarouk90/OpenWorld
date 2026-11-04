// The env colliders as nav obstacles: the district-block grids of src/nav/city (Forge Row, the Bastion yard) must treat the fences, walls and
// carts the player collides with as blocked, or the M07 hostiles path into them. Same boxes as the streamer, same keep-out, padded like a footprint.
import type { NavOrientedRect, NavRect } from '../nav/NavGrid';
import { boxesInRect, buildTileColliders, type ColliderBox } from './colliders';
import { defaultKeepOut } from './colliderKeepOut';
import { TILES } from './tiles';

/** Footprints grow by half a nav cell, so a walkable cell centre is never closer than that to a collider (as footprintRect in blocks.ts). */
export const NAV_PAD = 0.5;

const cache = new Map<string, ColliderBox[]>();
/** The boxes of a built tile (memoised: the streamer builds its own copy from the same pure function). */
function tileBoxes(name: string): ColliderBox[] {
  let boxes = cache.get(name);
  if (!boxes) {
    boxes = buildTileColliders(name, TILES[name] ?? [], defaultKeepOut()).boxes;
    cache.set(name, boxes);
  }
  return boxes;
}

/** Nav obstacles for every env collider that touches `rect` (the Harrowmark H tiles only; trunks do not exist there). */
export function envNavObstacles(rect: NavRect, tiles: readonly string[] = ['h1', 'h2', 'h3', 'h4']): NavOrientedRect[] {
  const out: NavOrientedRect[] = [];
  for (const t of tiles) {
    for (const b of boxesInRect(tileBoxes(t), { x0: rect.x0 - NAV_PAD, z0: rect.z0 - NAV_PAD, x1: rect.x1 + NAV_PAD, z1: rect.z1 + NAV_PAD })) {
      out.push({ cx: b.cx, cz: b.cz, hx: b.hx + NAV_PAD, hz: b.hz + NAV_PAD, yaw: b.yaw });
    }
  }
  return out;
}
