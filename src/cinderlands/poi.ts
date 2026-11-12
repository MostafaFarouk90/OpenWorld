// G4 Cinderlands (design 12.2 step 4): points of interest by Poisson-disc dart throwing over a fixed cell grid, each
// candidate and type drawn from a cell hash (seed + cell id). The whole manifest is built once in a fixed scan order,
// so nothing depends on streaming order, and the worker builds the same list from the same params for the POI pads.
import { SITE, type RiftTerrainParams } from './domain';
import { fnv1a, seededRng } from './seed';

export type PoiType = 'ember-camp' | 'ruined-hamlet' | 'blightbloom-grove' | 'mystery-rift' | 'warden';

/** Phase 1's weighted table (design weights; the other six types arrive in phase 2). */
export const POI_WEIGHTS: ReadonlyArray<{ type: Exclude<PoiType, 'warden'>; weight: number }> = [
  { type: 'ember-camp', weight: 20 },
  { type: 'ruined-hamlet', weight: 15 },
  { type: 'blightbloom-grove', weight: 12 },
  { type: 'mystery-rift', weight: 9 },
];

export const POI_SPACING = 280;
/** POIs keep this far inside the radius, and this far from the entry pad. */
export const POI_EDGE_MARGIN = 140;
export const POI_ENTRY_CLEAR = 220;
/** Flat pad radius under each POI and the blend ring outside it. */
export const PAD_RADIUS = 28;
export const PAD_BLEND = 24;
const TRIES_PER_CELL = 4;

export interface Poi {
  id: string;
  type: PoiType;
  x: number;
  z: number;
}

export interface RiftManifest {
  entry: { x: number; z: number; yaw: number };
  pois: Poi[];
  /** Id of the Warden's POI (the one furthest from the entry). */
  wardenId: string;
}

function pickType(roll: number): Exclude<PoiType, 'warden'> {
  const total = POI_WEIGHTS.reduce((s, w) => s + w.weight, 0);
  let r = roll * total;
  for (const w of POI_WEIGHTS) {
    if (r < w.weight) return w.type;
    r -= w.weight;
  }
  return POI_WEIGHTS[POI_WEIGHTS.length - 1].type;
}

const cache = new Map<string, RiftManifest>();
const keyOf = (p: RiftTerrainParams): string => `${p.seed}|${p.biome}|${p.radius}`;

/** The run's manifest (cached per params; the result is shared, do not mutate it). */
export function buildManifest(params: RiftTerrainParams): RiftManifest {
  const key = keyOf(params);
  const hit = cache.get(key);
  if (hit) return hit;
  const { seed, radius } = params;

  // Entry pad: on a seed angle, 85% of the way out, facing the centre.
  const er = seededRng(seed, 'entry');
  const angle = er.next() * Math.PI * 2;
  const entry = { x: SITE.x + Math.cos(angle) * radius * 0.85, z: SITE.z + Math.sin(angle) * radius * 0.85, yaw: 0 };
  // Yaw 0 faces -Z; face the site centre.
  entry.yaw = Math.atan2(-(SITE.x - entry.x), -(SITE.z - entry.z));

  const cell = POI_SPACING / Math.SQRT2;
  const n = Math.ceil(radius / cell);
  const accepted: Array<{ x: number; z: number; ci: number; cj: number }> = [];
  const grid = new Map<string, { x: number; z: number }>();
  const maxR = radius - POI_EDGE_MARGIN;
  for (let j = -n; j < n; j++) {
    for (let i = -n; i < n; i++) {
      for (let t = 0; t < TRIES_PER_CELL; t++) {
        const h = seededRng(fnv1a(`${seed}|cell|${i}|${j}|${t}`));
        const x = SITE.x + (i + h.next()) * cell;
        const z = SITE.z + (j + h.next()) * cell;
        if (Math.hypot(x - SITE.x, z - SITE.z) > maxR) continue;
        if (Math.hypot(x - entry.x, z - entry.z) < POI_ENTRY_CLEAR) continue;
        let ok = true;
        for (let dj = -2; dj <= 2 && ok; dj++) {
          for (let di = -2; di <= 2 && ok; di++) {
            const o = grid.get(`${i + di},${j + dj}`);
            if (o && Math.hypot(o.x - x, o.z - z) < POI_SPACING) ok = false;
          }
        }
        if (!ok) continue;
        grid.set(`${i},${j}`, { x, z });
        accepted.push({ x, z, ci: i, cj: j });
        break;
      }
    }
  }

  const pois: Poi[] = accepted.map((a) => {
    const roll = seededRng(fnv1a(`${seed}|type|${a.ci}|${a.cj}`)).next();
    return { id: `poi.${a.ci}.${a.cj}`, type: pickType(roll), x: a.x, z: a.z };
  });
  // The Warden waits at the POI furthest from the entry (Quell the Rift).
  let warden = pois[0];
  let best = -1;
  for (const p of pois) {
    const d = Math.hypot(p.x - entry.x, p.z - entry.z);
    if (d > best) {
      best = d;
      warden = p;
    }
  }
  if (warden) warden.type = 'warden';
  const manifest: RiftManifest = { entry, pois, wardenId: warden ? warden.id : '' };
  if (cache.size > 8) cache.clear();
  cache.set(key, manifest);
  return manifest;
}
