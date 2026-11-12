// G4 Cinderlands (design 12.2 step 2): the expedition's ground. A pure function of (x, z, params), no Three.js, so the
// terrain workers and the main thread build identical heights. `heightfield.ts` routes the site box here while a rift
// is active (`setRiftTerrain`), and everything outside the box stays the world shape, untouched.
import { createNoise2D } from '../terrain/noise';
import { BIOMES } from './biomes';
import { ASH_WALL_WIDTH, SITE, inSiteBox, type RiftTerrainParams } from './domain';
import { PAD_BLEND, PAD_RADIUS, POI_SPACING, buildManifest } from './poi';

type Noise = (x: number, y: number) => number;
interface Noises {
  warp: Noise;
  hills: Noise;
  ridge: Noise;
  mask: Noise;
}
const noiseCache = new Map<number, Noises>();
function noisesFor(seed: number): Noises {
  let n = noiseCache.get(seed);
  if (!n) {
    if (noiseCache.size > 4) noiseCache.clear();
    n = {
      warp: createNoise2D((seed ^ 0x5a17) >>> 0),
      hills: createNoise2D((seed ^ 0x2b3c) >>> 0),
      ridge: createNoise2D((seed ^ 0x7e11) >>> 0),
      mask: createNoise2D((seed ^ 0x13f9) >>> 0),
    };
    noiseCache.set(seed, n);
  }
  return n;
}

const smooth = (e0: number, e1: number, x: number): number => {
  const t = Math.min(Math.max((x - e0) / (e1 - e0), 0), 1);
  return t * t * (3 - 2 * t);
};

/** Height of the ash wall at its top; the edge is never climbable. */
export const ASH_WALL_HEIGHT = 120;

/** The ground before POI pads. */
function rawHeight(x: number, z: number, p: RiftTerrainParams): number {
  const { warp, hills, ridge, mask } = noisesFor(p.seed);
  const t = BIOMES[p.biome].terrain;
  const lx = x - SITE.x;
  const lz = z - SITE.z;
  const wx = lx + warp(lx / 1400, lz / 1400) * 180;
  const wz = lz + warp(lx / 1400 + 17.1, lz / 1400 - 9.3) * 180;
  // 6-octave fBm hills.
  let h = 0;
  let amp = 1;
  let freq = 1 / 520;
  for (let o = 0; o < 6; o++) {
    h += hills(wx * freq, wz * freq) * amp;
    amp *= 0.5;
    freq *= 2.02;
  }
  h *= t.hills;
  // Masked ridged noise for crags.
  const m = smooth(0.1, 0.7, mask(wx / 2600, wz / 2600));
  if (m > 0) {
    let r = 0;
    amp = 1;
    freq = 1 / 900;
    for (let o = 0; o < 4; o++) {
      const v = 1 - Math.abs(ridge(wx * freq, wz * freq));
      r += v * v * amp;
      amp *= 0.5;
      freq *= 2.1;
    }
    h += r * m * t.ridges * 0.55;
  }
  const d = Math.hypot(lx, lz);
  // Gentle bowl toward the edge, then the ash wall.
  const edge = smooth(p.radius - 80, p.radius + ASH_WALL_WIDTH, d);
  return t.base + h * (1 - 0.6 * edge) + edge * ASH_WALL_HEIGHT;
}

/** Terrain height inside the site box for a rift. Callers check `inSiteBox` first. */
export function riftHeightAt(x: number, z: number, p: RiftTerrainParams): number {
  const raw = rawHeight(x, z, p);
  const { pois, entry } = buildManifest(p);
  // Flat pads under the entry and every POI (spacing keeps pads from overlapping).
  let out = raw;
  const reach = PAD_RADIUS + PAD_BLEND;
  const consider = (cx: number, cz: number): void => {
    const d = Math.hypot(x - cx, z - cz);
    if (d >= reach) return;
    const padH = rawHeight(cx, cz, p);
    const k = 1 - smooth(PAD_RADIUS, reach, d);
    out = out * (1 - k) + padH * k;
  };
  consider(entry.x, entry.z);
  if (POI_SPACING > reach * 2) for (const poi of pois) if (Math.abs(x - poi.x) < reach && Math.abs(z - poi.z) < reach) consider(poi.x, poi.z);
  return out;
}

// The one live rift for this thread (main or worker). Null = no rift: the site box is the world shape (flat outside
// WORLD_BOUNDS), as before G4.
let active: RiftTerrainParams | null = null;

export function setRiftTerrain(p: RiftTerrainParams | null): void {
  active = p ? { seed: p.seed, biome: p.biome, radius: p.radius } : null;
}

export function riftTerrain(): RiftTerrainParams | null {
  return active;
}

/** The hook `heightAt` calls: a rift height for a point in the site box while a rift is live, else undefined. */
export function riftOverride(x: number, z: number): number | undefined {
  if (!active || !inSiteBox(x, z)) return undefined;
  return riftHeightAt(x, z, active);
}
