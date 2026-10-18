import type { GameContext } from '../core/Game';

/** Distance to solid ground under the player's feet, or null. Excludes the player's own capsule. */
export function groundDistance(ctx: GameContext, maxDistance: number): number | null {
  const f = ctx.player.feet;
  const lift = 0.1;
  const hit = ctx.physics.raycast(
    { x: f.x, y: f.y + lift, z: f.z },
    { x: 0, y: -1, z: 0 },
    maxDistance + lift,
    ctx.world.player.controller.collider,
  );
  return hit ? Math.max(0, hit.distance - lift) : null;
}
