// Rapier probes for the ride: ball casts ahead of the nose and behind the rump, parallel to the ground, that skip
// the player's own capsule, every sensor (trigger volumes) and the terrain heightfield.
import type RAPIER_API from '@dimforge/rapier3d';
import type { PhysicsWorld, Vec3 } from '../physics/PhysicsWorld';
import { MOUNT_TUNING } from './tuning';

export interface CastPorts {
  /** Distance a ball of `radius` travels from `from` along unit `dir` before a hit, or null within `max`. */
  castBall(from: Vec3, dir: Vec3, max: number, radius: number): number | null;
  heightAt(x: number, z: number): number;
}

export function rapierCastPorts(physics: PhysicsWorld, exclude: () => RAPIER_API.Collider | null, heightAt: (x: number, z: number) => number): CastPorts {
  const cache = new Map<number, RAPIER_API.Ball>();
  const rot = { x: 0, y: 0, z: 0, w: 1 };
  return {
    castBall(from, dir, max, radius) {
      if (!(max > 0)) return null;
      let ball = cache.get(radius);
      if (!ball) cache.set(radius, (ball = new physics.rapier.Ball(radius)));
      const hit = physics.world.castShape(
        from,
        rot,
        dir,
        ball,
        0,
        max,
        false,
        physics.rapier.QueryFilterFlags.EXCLUDE_SENSORS,
        undefined,
        exclude() ?? undefined,
        undefined,
        // The terrain is the controller's business (slope limits, autostep): only buildings, props and walls stop the horse.
        (c) => c.shape.type !== physics.rapier.ShapeType.HeightField,
      );
      return hit ? hit.time_of_impact : null;
    },
    heightAt,
  };
}

/** How far ahead (m) the forward casts reach past the nose at `speed`: enough to brake in, at least 1.4 m. */
export function castReach(speed: number, braking: number = MOUNT_TUNING.braking): number {
  const v = Number.isFinite(speed) ? Math.abs(speed) : 0;
  return Math.max(1.4, (v * v) / (2 * braking) + 1.2);
}

/**
 * Free metres in front of the nose (`sign` 1) or behind the rump (`sign` -1) of a horse at `feet` facing the unit
 * heading (hx, hz): a chest-height cast parallel to the ground (so slopes up to the controller's 45 degrees pass)
 * and a head-height cast for arches and beams. Infinity when nothing is within `reach`.
 */
export function freeDistance(ports: CastPorts, feet: Vec3, hx: number, hz: number, sign: 1 | -1, speed: number): number {
  const t = MOUNT_TUNING;
  const dx = hx * sign;
  const dz = hz * sign;
  const offset = sign > 0 ? t.noseReach : t.rumpReach;
  const reach = castReach(speed);
  // Ground slope along the direction of travel, from the heightfield (no slope data: flat).
  const h0 = ports.heightAt(feet.x, feet.z);
  const h1 = ports.heightAt(feet.x + dx * 2, feet.z + dz * 2);
  const rise = Number.isFinite(h0) && Number.isFinite(h1) ? (h1 - h0) / 2 : 0;
  const len = Math.hypot(1, rise);
  const dir = { x: dx / len, y: rise / len, z: dz / len };
  let free = Infinity;
  for (const height of [t.castChestHeight, t.castHeadHeight]) {
    const from = { x: feet.x, y: feet.y + height, z: feet.z };
    const toi = ports.castBall(from, dir, offset + reach, t.castRadius);
    if (toi !== null) free = Math.min(free, Math.max(0, toi * Math.hypot(dir.x, dir.z) - offset));
  }
  return free;
}
