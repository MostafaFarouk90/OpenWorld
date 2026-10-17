// Procedural elevation in plain TypeScript with no Three.js imports, so it runs unchanged on the
// main thread (physics, gameplay sampling) and inside terrain workers (chunk meshes).
// Reference: Vheissu/emerald-bayou.
//
// This is the single swappable world-shape module: everything that needs terrain height
// (meshes, Rapier heightfields, gameplay) goes through `heightAt`. Replace the body of
// `heightAt` with the real world design (hand-authored heightmaps, region masks) when it lands.

import { TERRAIN } from '../config/constants';
import { createNoise2D } from './noise';

const warpNoise = createNoise2D(TERRAIN.seed);
const continentNoise = createNoise2D(TERRAIN.seed + 1);
const hillNoise = createNoise2D(TERRAIN.seed + 2);
const ridgeNoise = createNoise2D(TERRAIN.seed + 3);
const maskNoise = createNoise2D(TERRAIN.seed + 4);
const detailNoise = createNoise2D(TERRAIN.seed + 5);

/** Approximate bounds of `heightAt`, for culling and colouring. */
export const HEIGHT_RANGE = { min: -40, max: 420 } as const;

/** Radius around the world origin kept gently rolling as a spawn meadow (future village site). */
const SPAWN_FLAT_RADIUS = 180;
const SPAWN_BLEND_RADIUS = 520;
const SPAWN_HEIGHT = 6;

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(Math.max((x - edge0) / (edge1 - edge0), 0), 1);
  return t * t * (3 - 2 * t);
}

/** Terrain height in metres at world position (x, z). Deterministic and thread-safe. */
export function heightAt(x: number, z: number): number {
  // Domain warp keeps hills and ridges from lining up on the noise lattice.
  const wx = x + warpNoise(x / 2400, z / 2400) * 320;
  const wz = z + warpNoise(x / 2400 + 31.7, z / 2400 - 17.3) * 320;

  // Low-frequency landmass: broad lowlands and uplands.
  const continent = continentNoise(wx / 7000, wz / 7000) * 45;

  // Rolling hills: 4-octave fBm.
  let hills = 0;
  let amp = 1;
  let freq = 1 / 900;
  for (let o = 0; o < 4; o++) {
    hills += hillNoise(wx * freq, wz * freq) * amp;
    amp *= 0.5;
    freq *= 2.03;
  }
  hills *= 28;

  // Mountain ranges: ridged noise, masked so they appear only in some regions.
  const mask = smoothstep(0.15, 0.65, maskNoise(wx / 5200, wz / 5200));
  let ridges = 0;
  if (mask > 0) {
    amp = 1;
    freq = 1 / 1600;
    let weight = 1;
    for (let o = 0; o < 4; o++) {
      let r = 1 - Math.abs(ridgeNoise(wx * freq, wz * freq));
      r *= r * weight;
      weight = Math.min(r * 1.6, 1);
      ridges += r * amp;
      amp *= 0.5;
      freq *= 2.1;
    }
    ridges *= mask * 280;
  }

  const detail = detailNoise(x / 45, z / 45) * 0.8;
  const natural = 12 + continent + hills + ridges + detail;

  // Flatten toward a gentle meadow around the origin.
  const d = Math.hypot(x, z);
  const t = smoothstep(SPAWN_FLAT_RADIUS, SPAWN_BLEND_RADIUS, d);
  const meadow = SPAWN_HEIGHT + hills * 0.08 + detail;
  return meadow + (natural - meadow) * t;
}
