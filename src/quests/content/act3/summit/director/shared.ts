// The summit installers share the lower block's helpers (PR 1) and add the Ysmeryth service access.
export { offerScene, toast, distanceTo, recheck } from '../../dragonspine/director/shared';
export type { Kit, Off } from '../../dragonspine/director/shared';
import type { Kit } from '../../dragonspine/director/shared';

export const ysmeryth = (k: Kit) => k.ctx.services.get('ysmeryth');
/** Metres (x, z) from a position to the player's feet. */
export const flat = (k: Kit, p: { x: number; z: number }): number => Math.hypot(k.ctx.player.feet.x - p.x, k.ctx.player.feet.z - p.z);
