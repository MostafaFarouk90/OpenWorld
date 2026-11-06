// The petrified stumps (Act 4 L1 PR 2, PR 1's deferred follow-up): about 600 charred stumps along the Ash Road, across the
// Waste's southern edge and in the two stump-grove POIs. Deterministic rows for the environment pass's PlacementField (a lazy
// tile `w1`, src/env/tiles.ts), so the stumps instance, hide past the wood class's range and thin with quality like every
// other wood row (the env pass's tiers: 40% on Low, 80% on Medium, all on High). Kept off the rope-lines, the Ash Road, the
// sites, the shelters, the plateaus and every anchor; no colliders (lazy tiles build none), so they never block a lane.
import type { PlacementRow } from '../env/PlacementField';
import { ASHGATE_PLATEAU, ASH_ROAD_POINTS, CALDERA_BOX, CROSSING_PLATEAU, M41_CAMP_PLATEAU, NE_GATE, SHELTER_PAD_SITES, type XZ } from '../terrain/shape/waste';
import { nearestRopeDistance } from './ropeDistance';
import { WASTE_LAYOUT } from './waste.layout';
import { WASTE_POIS, WASTE_SITE_DISCS, wastePoi } from './wasteSites';
import { ACT4_WORLD_LAYOUT } from '../region/act4/act4World.layout';

export const STUMP_ID = 'charred-stump';
export const STUMP_TILE = 'w1';

/** Clearances (m). */
export const STUMP_CLEAR = { rope: 8, road: 9, site: 15, shelter: 14, anchor: 4, structure: 5, poi: 8, gate: 160 } as const;

interface Band {
  id: string;
  count: number;
  sample(r: () => number): XZ;
}

/** mulberry32: a small fixed PRNG so the rows never change between builds. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const segDist = (x: number, z: number, pts: readonly XZ[]): number => {
  let best = Infinity;
  for (let i = 1; i < pts.length; i++) {
    const [ax, az] = pts[i - 1]!;
    const [bx, bz] = pts[i]!;
    const dx = bx - ax;
    const dz = bz - az;
    const l2 = dx * dx + dz * dz;
    const t = l2 > 0 ? Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2)) : 0;
    best = Math.min(best, Math.hypot(x - ax - dx * t, z - az - dz * t));
  }
  return best;
};

/** Total length of the Ash Road's polyline and a point at arc length s. */
const ROAD_LEN = ASH_ROAD_POINTS.slice(1).reduce((s, p, i) => s + Math.hypot(p[0] - ASH_ROAD_POINTS[i]![0], p[1] - ASH_ROAD_POINTS[i]![1]), 0);
function roadAt(s: number): { p: XZ; dir: XZ } {
  for (let i = 1; i < ASH_ROAD_POINTS.length; i++) {
    const a = ASH_ROAD_POINTS[i - 1]!;
    const b = ASH_ROAD_POINTS[i]!;
    const l = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (s <= l || i === ASH_ROAD_POINTS.length - 1) {
      const t = Math.min(1, s / l);
      return { p: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t], dir: [(b[0] - a[0]) / l, (b[1] - a[1]) / l] };
    }
    s -= l;
  }
  return { p: ASH_ROAD_POINTS[0]!, dir: [0, 1] };
}

const grove = (id: string, count: number): Band => {
  const p = wastePoi(id);
  return {
    id,
    count,
    sample: (r) => {
      const a = r() * Math.PI * 2;
      const d = 4 + Math.sqrt(r()) * (p.radius - 4);
      return [p.at[0] + Math.sin(a) * d, p.at[1] + Math.cos(a) * d];
    },
  };
};

const BANDS: readonly Band[] = [
  // The Ash Road's verges: 12 to 60 m off the road, either side.
  {
    id: 'ash-road',
    count: 220,
    sample: (r) => {
      const { p, dir } = roadAt(r() * ROAD_LEN);
      const side = r() < 0.5 ? -1 : 1;
      const off = side * (12 + r() * 48);
      return [p[0] - dir[1] * off, p[1] + dir[0] * off];
    },
  },
  // The Waste's southern edge, the first 700 m in from its box.
  { id: 'waste-edge', count: 260, sample: (r) => [7400 + r() * 7200, 4620 + r() * 700] },
  grove('stumps.1', 60),
  grove('stumps.2', 60),
];

const inRect = (x: number, z: number, p: { box: { minX: number; maxX: number; minZ: number; maxZ: number } }, pad: number) =>
  x >= p.box.minX - pad && x <= p.box.maxX + pad && z >= p.box.minZ - pad && z <= p.box.maxZ + pad;

/** Every anchor and structure centre of the two Act 4 world layouts (stumps keep clear of them all). */
const FIXED: readonly { x: number; z: number; r: number }[] = [
  ...[...WASTE_LAYOUT.anchors, ...ACT4_WORLD_LAYOUT.anchors].map((a) => ({ x: a.x, z: a.z, r: STUMP_CLEAR.anchor })),
  ...[...WASTE_LAYOUT.structures, ...ACT4_WORLD_LAYOUT.structures].map((s) => ({ x: s.x, z: s.z, r: STUMP_CLEAR.structure + Math.hypot(s.footprint[0], s.footprint[1]) / 2 })),
];

/** Why a spot is refused (null when a stump may stand there). The grove's own POI is allowed. */
export function stumpRefusal(x: number, z: number, groveId?: string): string | null {
  if (x > CALDERA_BOX.x0 && x < CALDERA_BOX.x1 && z > CALDERA_BOX.z0 && z < CALDERA_BOX.z1) return 'caldera';
  if (Math.hypot(x - NE_GATE[0], z - NE_GATE[1]) < STUMP_CLEAR.gate) return 'gate';
  if (nearestRopeDistance(x, z) < STUMP_CLEAR.rope) return 'rope';
  if (segDist(x, z, ASH_ROAD_POINTS) < STUMP_CLEAR.road) return 'road';
  for (const s of WASTE_SITE_DISCS) if (Math.hypot(x - s.at[0], z - s.at[1]) < s.radius + STUMP_CLEAR.site) return 'site';
  for (const [, sx, sz] of SHELTER_PAD_SITES) if (Math.hypot(x - sx, z - sz) < STUMP_CLEAR.shelter) return 'shelter';
  for (const p of [ASHGATE_PLATEAU, M41_CAMP_PLATEAU, CROSSING_PLATEAU]) if (inRect(x, z, p, 20)) return 'plateau';
  for (const p of WASTE_POIS) if (p.id !== groveId && Math.hypot(x - p.at[0], z - p.at[1]) < p.radius + STUMP_CLEAR.poi) return 'poi';
  for (const f of FIXED) if (Math.hypot(x - f.x, z - f.z) < f.r) return 'fixed';
  return null;
}

let cache: PlacementRow[] | null = null;

/** The tile's rows: fixed, about 600. */
export function wasteStumpRows(): PlacementRow[] {
  if (cache) return cache;
  const r = rng(0x5a17);
  const out: PlacementRow[] = [];
  for (const b of BANDS) {
    let made = 0;
    for (let tries = 0; made < b.count && tries < b.count * 20; tries++) {
      const [x, z] = b.sample(r);
      const yaw = r() * 360;
      const scale = 0.7 + r() * 0.6;
      if (stumpRefusal(x, z, b.id.startsWith('stumps.') ? b.id : undefined)) continue;
      out.push({ id: STUMP_ID, x: Math.round(x * 10) / 10, z: Math.round(z * 10) / 10, yaw: Math.round(yaw), scale: Math.round(scale * 100) / 100 });
      made++;
    }
  }
  cache = out;
  return out;
}
