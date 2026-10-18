// Procedural elevation in plain TypeScript with no Three.js imports, so it runs unchanged on the
// main thread (physics, gameplay sampling) and inside terrain workers (chunk meshes).
// Reference: Vheissu/emerald-bayou.
//
// This is the single world-shape module: everything that needs terrain height (meshes, Rapier
// heightfields, the map, gameplay) goes through `heightAt`. v0.5 shapes the procedural ground with
// ridge suppression, plateaus and graded roads (`shaping.ts`, data in `shape/`); contracts/heightfield.md.

import { TERRAIN, WORLD_BOUNDS } from '../config/constants';
import { createNoise2D } from './noise';
import { WORLD_SHAPE } from './shape';
import { buildShaper } from './shaping';

const warpNoise = createNoise2D(TERRAIN.seed);
const continentNoise = createNoise2D(TERRAIN.seed + 1);
const hillNoise = createNoise2D(TERRAIN.seed + 2);
const ridgeNoise = createNoise2D(TERRAIN.seed + 3);
const maskNoise = createNoise2D(TERRAIN.seed + 4);
const detailNoise = createNoise2D(TERRAIN.seed + 5);

/**
 * Hard bounds of `heightAt`, derived from the term amplitudes below (noise is within [-1, 1]):
 * 12 + continent 45 + hills 28 * 1.875 + ridges 280 * 1.875 + detail 0.8 at most, and
 * 12 - 45 - 52.5 - 0.8 at least. Update together with the terms.
 */
export const HEIGHT_RANGE = { min: -90, max: 640 } as const;

/**
 * The spawn meadow around the world origin (future village site) is exactly flat at height 0
 * within this radius, so the physics test level and player spawn line up with the terrain.
 */
export const SPAWN_FLAT_RADIUS = 180;
/** Distance from the origin at which the meadow has fully blended into natural terrain. */
export const SPAWN_BLEND_RADIUS = 520;

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(Math.max((x - edge0) / (edge1 - edge0), 0), 1);
  return t * t * (3 - 2 * t);
}

/**
 * The procedural ground before any shaping, with the ridge term scaled by `ridgeScale` (1 = natural). Only the
 * shaper and tests call it; everything else uses `heightAt`.
 */
function baseHeight(x: number, z: number, ridgeScale: number): number {
  const spawnDistance = Math.hypot(x, z);
  if (spawnDistance <= SPAWN_FLAT_RADIUS) return 0;

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
    if (ridgeScale !== 1) ridges *= ridgeScale;
  }

  const detail = detailNoise(x / 45, z / 45) * 0.8;
  const natural = 12 + continent + hills + ridges + detail;

  // Blend from the flat meadow (height 0) into natural terrain.
  return natural * smoothstep(SPAWN_FLAT_RADIUS, SPAWN_BLEND_RADIUS, spawnDistance);
}

/** The unshaped procedural ground (tests, regression baselines). */
export function naturalHeightAt(x: number, z: number): number {
  return baseHeight(x, z, 1);
}

const shaper = buildShaper(WORLD_SHAPE, baseHeight, { bounds: WORLD_BOUNDS, heightRange: HEIGHT_RANGE });

/** Terrain height in metres at world position (x, z). Deterministic and thread-safe. */
export function heightAt(x: number, z: number): number {
  return shaper.heightAt(x, z);
}

/** The world's road profiles (map, tests): centreline height at arc `s` and the road's length. */
export const worldRoads = {
  profile: (id: string, s: number) => shaper.roadProfile(id, s),
  length: (id: string) => shaper.roadLength(id),
};
