// Heightfield data in the exact layout Rapier's heightfield collider expects, built
// synchronously from heightfield.ts. This module does not import Rapier; physics code consumes it:
//
//   const hf = buildPhysicsHeightfield(cx, cz, 200, 128);
//   const desc = RAPIER.ColliderDesc.heightfield(hf.nrows, hf.ncols, hf.heights, hf.scale)
//     .setTranslation(hf.center.x, hf.center.y, hf.center.z);
//
// Layout (verified against @dimforge/rapier3d 0.21 with ray casts):
// - `nrows` / `ncols` are cell counts; `heights` holds (nrows + 1) * (ncols + 1) samples.
// - Rows run along local z and columns along local x, stored column-major:
//   heights[row + col * (nrows + 1)] is the sample at
//   x = -scale.x / 2 + col * scale.x / ncols, z = -scale.z / 2 + row * scale.z / nrows.
// - The shape is centred on the collider's origin, so the collider goes at the patch centre.

import { heightAt } from './heightfield';

export interface PhysicsHeightfield {
  /** Cells along z. */
  nrows: number;
  /** Cells along x. */
  ncols: number;
  /** World heights in metres, column-major, length (nrows + 1) * (ncols + 1). */
  heights: Float32Array;
  /** Patch extent on x and z; y = 1 because heights are already in metres. */
  scale: { x: number; y: number; z: number };
  /** Where to place the collider (world position of the patch centre, y = 0). */
  center: { x: number; y: number; z: number };
}

/**
 * Samples a square patch of terrain centred on (centerX, centerZ).
 * @param size Edge length of the patch in metres.
 * @param cells Cells along each edge (spacing = size / cells). Match or exceed the finest render
 *   LOD (TERRAIN.minChunkSize / TERRAIN.chunkSegments) so the collider hugs the visible ground.
 */
export function buildPhysicsHeightfield(
  centerX: number,
  centerZ: number,
  size: number,
  cells: number,
): PhysicsHeightfield {
  const nrows = cells;
  const ncols = cells;
  const step = size / cells;
  const half = size / 2;
  const heights = new Float32Array((nrows + 1) * (ncols + 1));
  for (let col = 0; col <= ncols; col++) {
    const x = centerX - half + col * step;
    for (let row = 0; row <= nrows; row++) {
      heights[row + col * (nrows + 1)] = heightAt(x, centerZ - half + row * step);
    }
  }
  return {
    nrows,
    ncols,
    heights,
    scale: { x: size, y: 1, z: size },
    center: { x: centerX, y: 0, z: centerZ },
  };
}
