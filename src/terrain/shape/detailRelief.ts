// Environment pass G0c: low, clamped ground relief for the Brightwater tile B1, in plain TypeScript (no Three.js) so
// terrain workers run it unchanged. `heightAt` adds it after the world shaper. It is zero outside the B1 blend band and
// inside the keep-flat table (`detailReliefZones.ts`, generated from the layout), so anchors, triggers and structures stay put.
import { TERRAIN } from '../../config/constants';
import { createNoise2D } from '../noise';
import { RELIEF_ZONES } from './detailReliefZones';
import { ZONE_BOUNDS } from './reliefZonesBuild';

/** Largest absolute relief in metres. */
export const RELIEF_MAX = 1.2;
/** Metres over which the relief ramps in outside a keep-flat rectangle, and out beyond the B1 tile core. */
export const RELIEF_BLEND = 10;
/** The B1 tile core (x -100..160, z -30..230); the relief fades to nothing over `RELIEF_TILE_BAND` outside it. */
export const RELIEF_TILE = { x0: -100, x1: 160, z0: -30, z1: 230 } as const;
export const RELIEF_TILE_BAND = 52;

const swellNoise = createNoise2D(TERRAIN.seed + 11);
const rippleNoise = createNoise2D(TERRAIN.seed + 12);

function smoothstep(t: number): number {
  const c = t < 0 ? 0 : t > 1 ? 1 : t;
  return c * c * (3 - 2 * c);
}

/** 0 inside the tile core, rising to 1 across the band: how far the point is from the tile, as a ramp. */
export function tileWeight(x: number, z: number): number {
  const dx = Math.max(RELIEF_TILE.x0 - x, 0, x - RELIEF_TILE.x1);
  const dz = Math.max(RELIEF_TILE.z0 - z, 0, z - RELIEF_TILE.z1);
  return 1 - smoothstep(Math.hypot(dx, dz) / RELIEF_TILE_BAND);
}

/** 0 inside any keep-flat rectangle, 1 further than `RELIEF_BLEND` from all of them. */
export function reliefOpenness(x: number, z: number): number {
  let open = 1;
  for (const [x0, z0, x1, z1] of RELIEF_ZONES) {
    const dx = Math.max(x0 - x, 0, x - x1);
    const dz = Math.max(z0 - z, 0, z - z1);
    const d = Math.hypot(dx, dz);
    if (d < RELIEF_BLEND) open = Math.min(open, smoothstep(d / RELIEF_BLEND));
  }
  return open;
}

/** Detail relief in metres at (x, z); within [-RELIEF_MAX, RELIEF_MAX] and exactly 0 where nothing may move. */
export function detailRelief(x: number, z: number): number {
  if (x < ZONE_BOUNDS.x0 || x > ZONE_BOUNDS.x1 || z < ZONE_BOUNDS.z0 || z > ZONE_BOUNDS.z1) return 0;
  const w = tileWeight(x, z);
  if (w <= 0) return 0;
  const open = reliefOpenness(x, z);
  if (open <= 0) return 0;
  // Broad swells (about 60 m) carry the shape, a smaller ripple (about 20 m) breaks them up.
  const raw = swellNoise(x / 34, z / 34) * 0.85 + rippleNoise(x / 20, z / 20) * 0.2;
  const h = raw * RELIEF_MAX * w * open;
  return h > RELIEF_MAX ? RELIEF_MAX : h < -RELIEF_MAX ? -RELIEF_MAX : h;
}
