import type { GameContext } from '../core/Game';
import { heightAt } from '../terrain/heightfield';
import type { ProjectileHost } from './Projectile';

/**
 * The shared host of class projectile systems (Pathfinder bolts, the Emberwright's Ember Bolt): actors, the terrain height
 * and a ray against the physics colliders, so a bolt stops at walls and closed doors as well as the ground.
 *
 *   const projectiles = new ProjectileSystem(createProjectileHost(ctx));
 *   projectiles.launch({ casterId, origin, direction, speed, lifetime, radius, hostileOnly: true, onHit });
 *
 * Each class owns and updates its own `ProjectileSystem`; only the host is shared.
 */
export function createProjectileHost(ctx: Pick<GameContext, 'actors' | 'physics'>): ProjectileHost {
  return {
    actors: ctx.actors,
    heightAt,
    rayCast(origin, dir, maxDist) {
      const hit = ctx.physics.raycast(origin, dir, maxDist);
      return hit ? { point: hit.point } : null;
    },
  };
}
