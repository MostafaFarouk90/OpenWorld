// What the Harrowmark installers share: the Act 2 kit, scene offering, the toast, distances (the Act 3 helpers, reused as is).
export type { Kit, Off } from '../../../act2/director/kit';
export { distanceTo, offerScene, recheck, toast } from '../../../act3/dragonspine/director/shared';

import type { Kit as KitT } from '../../../act2/director/kit';
import { distanceTo as groundDistance } from '../../../act3/dragonspine/director/shared';

/** Height a player may be off an interior anchor and still count as on its floor (an interior floats 150 m up). */
export const SAME_FLOOR_DY = 6;

/**
 * Act 4 L14 (Phase G report L1): within `r` metres on the ground and on the anchor's own floor. A floated interior sits
 * over its building, so ground distance alone let M37's toast open outside, at the inn door, below the feast table.
 */
export function onFloorWithin(k: Pick<KitT, 'ctx'>, anchorId: string, r: number): boolean {
  const a = k.ctx.anchors.find(anchorId);
  if (!a) return false;
  return Math.abs(k.ctx.player.feet.y - a.position.y) <= SAME_FLOOR_DY && groundDistance(k as KitT, anchorId) <= r;
}
