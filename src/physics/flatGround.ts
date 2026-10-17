import type { HeightfieldDesc } from './PhysicsWorld';

/**
 * A flat square heightfield of edge `size` metres at height `y`, centred on (centerX, centerZ).
 * Use this instead of one huge cuboid for large walkable floors: Rapier 0.21's shape casts lose
 * contact with very large cuboids (half-extents beyond roughly 10 m), so a character walking
 * diagonally across one sinks through it. Heightfields do not have this problem.
 */
export function flatGround(size: number, cells = 32, y = 0, centerX = 0, centerZ = 0): HeightfieldDesc {
  return {
    nrows: cells,
    ncols: cells,
    heights: new Float32Array((cells + 1) * (cells + 1)).fill(y),
    scale: { x: size, y: 1, z: size },
    center: { x: centerX, y: 0, z: centerZ },
  };
}
