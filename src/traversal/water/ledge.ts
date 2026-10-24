// The ledge climb's probe (the K0 spike's trap: `wallContact()` reports nothing at a step face under water, so a swimmer
// blocked against a face looks ahead and down for a top instead).
import type { Vec3Like } from '../../core/events';
import type { PhysicsWorld } from '../../physics/PhysicsWorld';

type Ray = Pick<PhysicsWorld, 'raycast'>;

/** The highest walkable top ahead of the swimmer within reach, at least 0.3 m above the feet, or null. Yaw 0 faces -Z. */
export function ledgeProbe(physics: Ray, exclude: () => Parameters<PhysicsWorld['raycast']>[3]) {
  return (feet: Vec3Like, yaw: number): Vec3Like | null => {
    const fx = -Math.sin(yaw);
    const fz = -Math.cos(yaw);
    // The highest top within reach, so a sloped bank still lands the swimmer on its flat rim.
    let best: Vec3Like | null = null;
    for (const reach of [0.5, 0.8, 1.1, 1.4]) {
      const from = { x: feet.x + fx * reach, y: feet.y + 2.6, z: feet.z + fz * reach };
      const hit = physics.raycast(from, { x: 0, y: -1, z: 0 }, 2.6, exclude());
      if (hit && hit.point.y > feet.y + 0.3 && (!best || hit.point.y > best.y + 0.01)) best = { x: hit.point.x, y: hit.point.y + 0.05, z: hit.point.z };
    }
    return best;
  };
}
