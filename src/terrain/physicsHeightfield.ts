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
// The full contract lives in /mnt/project-files/contracts/heightfield.md.
//
// Collider registration is independent of visual LOD: ColliderPatches decides which patches
// around the player need colliders; physics only adds and removes what it is handed.

import { TERRAIN } from '../config/constants';
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
 * @throws RangeError when the centre is not finite, size is not a positive finite number, or
 *   cells is not a positive integer.
 */
export function buildPhysicsHeightfield(
  centerX: number,
  centerZ: number,
  size: number,
  cells: number,
): PhysicsHeightfield {
  if (!Number.isFinite(centerX) || !Number.isFinite(centerZ)) {
    throw new RangeError(`Heightfield centre must be finite, got (${centerX}, ${centerZ})`);
  }
  if (!Number.isFinite(size) || size <= 0) {
    throw new RangeError(`Heightfield size must be a positive finite number, got ${size}`);
  }
  if (!Number.isInteger(cells) || cells < 1) {
    throw new RangeError(`Heightfield cells must be a positive integer, got ${cells}`);
  }
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

export interface ColliderPatch {
  /** Stable id: the patch's grid coordinates, `"ix,iz"`. */
  key: string;
  heightfield: PhysicsHeightfield;
}

export interface ColliderPatchChanges {
  added: ColliderPatch[];
  /** Keys of patches whose colliders should be removed. */
  removed: string[];
}

/**
 * Decides which heightfield patches around the player get colliders: a (2r + 1)^2 block of
 * square patches on a fixed world grid, centred on the player's patch. Patches only change when
 * the player crosses into another patch, so physics sees a small add/remove diff.
 */
export class ColliderPatches {
  private readonly active = new Set<string>();

  constructor(
    readonly patchSize: number = TERRAIN.colliderPatchSize,
    readonly cells: number = TERRAIN.colliderPatchCells,
    readonly radius: number = TERRAIN.colliderPatchRadius,
  ) {
    if (!Number.isFinite(patchSize) || patchSize <= 0) {
      throw new RangeError(`Patch size must be a positive finite number, got ${patchSize}`);
    }
    if (!Number.isInteger(cells) || cells < 1) {
      throw new RangeError(`Patch cells must be a positive integer, got ${cells}`);
    }
    if (!Number.isInteger(radius) || radius < 0) {
      throw new RangeError(`Patch radius must be a non-negative integer, got ${radius}`);
    }
  }

  /** Keys of patches that currently have colliders. */
  get keys(): string[] {
    return [...this.active];
  }

  /** Recomputes the patch set for the player at (x, z). Non-finite positions change nothing. */
  update(x: number, z: number): ColliderPatchChanges {
    const changes: ColliderPatchChanges = { added: [], removed: [] };
    if (!Number.isFinite(x) || !Number.isFinite(z)) return changes;

    const px = Math.floor(x / this.patchSize);
    const pz = Math.floor(z / this.patchSize);
    const wanted = new Set<string>();
    for (let iz = pz - this.radius; iz <= pz + this.radius; iz++) {
      for (let ix = px - this.radius; ix <= px + this.radius; ix++) {
        const key = `${ix},${iz}`;
        wanted.add(key);
        if (this.active.has(key)) continue;
        this.active.add(key);
        changes.added.push({
          key,
          heightfield: buildPhysicsHeightfield(
            (ix + 0.5) * this.patchSize,
            (iz + 0.5) * this.patchSize,
            this.patchSize,
            this.cells,
          ),
        });
      }
    }
    for (const key of this.active) {
      if (wanted.has(key)) continue;
      this.active.delete(key);
      changes.removed.push(key);
    }
    return changes;
  }

  /** Forgets all patches; returns their keys so physics can remove the colliders. */
  clear(): string[] {
    const removed = [...this.active];
    this.active.clear();
    return removed;
  }
}
