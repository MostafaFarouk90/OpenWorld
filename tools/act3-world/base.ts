// Copy of heightfield.ts's baseHeight, so the fit runs while the world shape is still invalid (heightfield.ts builds it on import).
import { TERRAIN, WORLD_BOUNDS } from '../../src/config/constants';
import { createNoise2D } from '../../src/terrain/noise';
import { ACT3_MIN_FLOOR, ACT3_PROTECTED_BOXES } from '../../src/terrain/shape/act3';
const warpNoise = createNoise2D(TERRAIN.seed);
const continentNoise = createNoise2D(TERRAIN.seed + 1);
const hillNoise = createNoise2D(TERRAIN.seed + 2);
const ridgeNoise = createNoise2D(TERRAIN.seed + 3);
const maskNoise = createNoise2D(TERRAIN.seed + 4);
const detailNoise = createNoise2D(TERRAIN.seed + 5);
export const SPAWN_FLAT_RADIUS = 180;
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

export const shapeBaseHeight = baseHeight;
export const WORLD_SHAPER_OPTIONS = { bounds: WORLD_BOUNDS, heightRange: { min: -90, max: 640 }, protectedBoxes: ACT3_PROTECTED_BOXES, minFloor: ACT3_MIN_FLOOR };
