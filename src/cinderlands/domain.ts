// G4 Cinderlands (design 12.2 step 1, plan R1 and D1): one fixed expedition site east of the world, outside
// WORLD_BOUNDS (x up to 23000) with a 4.4 km gap, so no story chunk, anchor or region ever overlaps it. The seed moves
// the noise, not the site. Rift Walks use a 1.2 km radius (D1 a), the full mode the design's 2.4 km.
import type { BiomeId } from './seed';

export const SITE = { x: 30000, z: 7500 } as const;
/** Rift Walk radius before the ending (D1 a), and the design's full-mode radius. */
export const RIFT_WALK_RADIUS = 1200;
export const FULL_MODE_RADIUS = 2400;
/** Width of the ash wall that rises past the radius. */
export const ASH_WALL_WIDTH = 160;
/** The box the rift terrain owns: the largest domain plus its wall plus a margin. Everything outside is the world. */
export const SITE_HALF = FULL_MODE_RADIUS + ASH_WALL_WIDTH + 240;
export const SITE_BOX = { x0: SITE.x - SITE_HALF, z0: SITE.z - SITE_HALF, x1: SITE.x + SITE_HALF, z1: SITE.z + SITE_HALF } as const;

export function inSiteBox(x: number, z: number): boolean {
  return x >= SITE_BOX.x0 && x < SITE_BOX.x1 && z >= SITE_BOX.z0 && z < SITE_BOX.z1;
}

/** What the terrain worker and the main thread both need to build the same ground: plain numbers only. */
export interface RiftTerrainParams {
  seed: number;
  biome: BiomeId;
  radius: number;
}

export function isRiftTerrainParams(v: unknown): v is RiftTerrainParams {
  if (typeof v !== 'object' || v === null) return false;
  const p = v as Record<string, unknown>;
  return (
    Number.isInteger(p.seed) &&
    (p.seed as number) >= 0 &&
    (p.seed as number) <= 0xffffffff &&
    typeof p.biome === 'string' &&
    ['ashfield', 'glassland', 'fenland', 'rimeridge', 'magmafield'].includes(p.biome) &&
    (p.radius === RIFT_WALK_RADIUS || p.radius === FULL_MODE_RADIUS)
  );
}

/** Distance from the site centre. */
export const siteDistance = (x: number, z: number): number => Math.hypot(x - SITE.x, z - SITE.z);
