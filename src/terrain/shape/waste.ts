// Act 4 thread L1: the Ash Road and the Ashen Waste's terrain (plans/act4-L1.md sections 1 to 3 and 7). Plain data and
// maths with no THREE, so the terrain workers load it. Every Act 4 site, road and rope-line point lives here (or in
// src/region/act4/act4Places.ts, which re-exports these with ground heights); siblings import, never copy.
//
// The Waste's shape, in the shaper's order: a base flat that tames the natural ridges into broken mesas, the
// glass-sand plain, the rise to the Caldera's rim (an uplift on a loop round the Caldera hole), the site plateaus, then
// the roads (the Ash Road, the Underways exit track and the six rope-lines, all graded). The dunes are not a shaper
// layer: `wasteRelief` adds them after the shaper (as G0c's detail relief does), kept off every lane and site.
import { TERRAIN } from '../../config/constants';
import { createNoise2D } from '../noise';
import type { FlatDef, PlateauDef, RoadDef, ShapeBox, UpliftDef } from '../shaping';

export type XZ = readonly [number, number];

/** The Waste's engine box (`regions.ts`, map minus 1000) and the Caldera hole inside it. Min inclusive, max exclusive. */
export const WASTE_BOX = { x0: 7000, z0: 4500, x1: 15000, z1: 11000 } as const;
export const CALDERA_BOX = { x0: 9500, z0: 6500, x1: 12500, z1: 9500 } as const;
/** The local origin every Waste noise pattern (here and in the ground shader) samples about: the Caldera's centre. */
export const WASTE_ORIGIN = { x: 11000, z: 8000 } as const;

// ---- sites (plan 1.1)

/** Harrowmark's north-east gate: `gatePosition('northeast')` (city.ts), bearing 25.71 degrees, radius 750. */
export const NE_GATE: XZ = [8825.4, 2675.7];
export const UNDERWAYS_EXIT: XZ = [8900, 3300];
export const M41_CAMP: XZ = [8915, 3330];
export const ASH_ROAD_JUNCTION: XZ = [9160, 3080];
export const ASHGATE: XZ = [10000, 4450];
export const CROSSING: XZ = [10460, 5300];
export const WALKER_CAMP: XZ = [8400, 5900];
export const R24_SPRING: XZ = [9840, 5480];
export const CINDER_CHAPEL: XZ = [7900, 8200];
export const GLASSLANDS: XZ = [13300, 5700];
export const HUSK_CATHEDRAL: XZ = [13800, 7900];
/** At the foot of the rim's steep flank (it climbs 0.6 from z 6300 to the crest inside the hole). */
export const RIMFOOT: XZ = [11000, 6200];
export const SUNFORGE_COLUMN: XZ = [11000, 8000];

// ---- plateaus (heights fitted to the shaped ground round each site; plan 3 item 4)

const plateau = (id: string, minX: number, maxX: number, minZ: number, maxZ: number, height: number, blend: number): PlateauDef => ({
  id,
  box: { minX, maxX, minZ, maxZ },
  height,
  blend,
});

export const ASHGATE_PLATEAU = plateau('ashgate', 9560, 10060, 4340, 4480, 45, 120);
export const M41_CAMP_PLATEAU = plateau('m41-camp', 8870, 8960, 3285, 3365, 30, 60);
export const CROSSING_PLATEAU = plateau('waste-crossing', 10440, 10480, 5280, 5320, 121, 150);
export const WALKER_CAMP_PLATEAU = plateau('walker-camp', 8300, 8500, 5800, 6000, 110, 160);
export const CINDER_CHAPEL_PLATEAU = plateau('cinder-chapel', 7820, 7980, 8120, 8280, 70, 80);
export const HUSK_CATHEDRAL_PLATEAU = plateau('husk-cathedral', 13740, 13860, 7870, 8040, 80, 80);
export const RIMFOOT_PLATEAU = plateau('rimfoot', 10950, 11050, 6150, 6250, 178, 100);

/**
 * The rope-line shelters' pads (L1 plan section 7): a flat 10 m square at each shelter (src/region/act4/ropeLines.ts
 * SHELTER_SPOTS, 13 m off its line), level with its line's graded profile there, so the lean-to stands flat and the
 * pad meets the lane without a step. Fitted from the built road profiles (ropeLines.test.ts checks both the positions
 * and the heights); the Crossing's shelter stands on the Crossing's own plateau.
 */
export const SHELTER_PAD_HALF = 5;
export const SHELTER_PAD_SITES: readonly (readonly [id: string, x: number, z: number, height: number, blend: number])[] = [
  ['shelter.cinder-road-north.1', 10221.58, 4897, 80.92, 5],
  ['shelter.cinder-road-north.2', 10578.87, 5632.17, 123.91, 65],
  ['shelter.cinder-road-north.3', 10771.21, 5930.25, 153.59, 48],
  ['shelter.ashgate-camp.1', 9648, 4741.84, 86.84, 5],
  ['shelter.ashgate-camp.2', 9326.94, 5021.66, 77.61, 12],
  ['shelter.ashgate-camp.3', 9006.53, 5302.01, 87.18, 5],
  ['shelter.ashgate-camp.4', 8691.85, 5589.76, 102.32, 30],
  ['shelter.camp-chapel.1', 8171.73, 6327.48, 125.89, 35],
  ['shelter.camp-chapel.2', 8063.89, 6800.91, 155.80, 101],
  ['shelter.camp-chapel.3', 8097.18, 7282.18, 90.23, 44],
  ['shelter.camp-chapel.4', 8036.07, 7734.82, 79.73, 5],
  ['shelter.camp-crossing.1', 8814.83, 5789.12, 109.82, 8],
  ['shelter.camp-crossing.2', 9225.93, 5665.79, 121.76, 78],
  ['shelter.camp-crossing.3', 9638.4, 5548.46, 115.04, 133],
  ['shelter.camp-crossing.4', 10050.22, 5425.85, 163.32, 89],
  ['shelter.crossing-glasslands.1', 10940.35, 5268.58, 69.43, 5],
  ['shelter.crossing-glasslands.2', 11412.25, 5331.89, 72.82, 5],
  ['shelter.crossing-glasslands.3', 11886.9, 5411, 69.55, 5],
  ['shelter.crossing-glasslands.4', 12357.85, 5502.86, 78.22, 20],
  ['shelter.crossing-glasslands.5', 12825.59, 5618.38, 82.00, 130],
  ['shelter.glasslands-cathedral.1', 13494.23, 6117.53, 130.25, 106],
  ['shelter.glasslands-cathedral.2', 13625.09, 6553.97, 82.34, 5],
  ['shelter.glasslands-cathedral.3', 13670.15, 7001.68, 76.55, 5],
  ['shelter.glasslands-cathedral.4', 13655.28, 7462.83, 85.37, 5],
];
export const SHELTER_PADS: readonly PlateauDef[] = SHELTER_PAD_SITES.map(([id, x, z, h, blend]) =>
  plateau(`pad.${id}`, x - SHELTER_PAD_HALF, x + SHELTER_PAD_HALF, z - SHELTER_PAD_HALF, z + SHELTER_PAD_HALF, h, blend),
);

export const WASTE_PLATEAUS: readonly PlateauDef[] = [
  ASHGATE_PLATEAU,
  M41_CAMP_PLATEAU,
  CROSSING_PLATEAU,
  WALKER_CAMP_PLATEAU,
  CINDER_CHAPEL_PLATEAU,
  HUSK_CATHEDRAL_PLATEAU,
  RIMFOOT_PLATEAU,
  ...SHELTER_PADS,
];

// ---- flats and the rim (plan 3 items 1 to 3)

/** Tames the natural ridges (up to 436 m south of the Caldera) into mesas; its reach stops short of every neighbour (south into the null strip, which is nobody's ground). */
export const WASTE_BASE_FLAT: FlatDef = { id: 'waste-base', box: { minX: 7300, maxX: 14700, minZ: 4600, maxZ: 10650 }, blend: 300, level: 110, relief: 0.4, maxRise: 90 };
/** The glass-sand plain the Singing Slag stands on. */
export const GLASSLANDS_PLAIN: FlatDef = { id: 'glasslands-plain', box: { minX: 13000, maxX: 14000, minZ: 5200, maxZ: 6000 }, blend: 200, level: 150, relief: 0.05 };
/**
 * The north-east corner's low ground (natural -60 m near (14250, 10950), under the kill plane) lifted clear of it. Its
 * reach stops at z 10990, short of the Dragonspine's box.
 */
export const WASTE_NORTH_LIFT: FlatDef = { id: 'waste-north-lift', box: { minX: 12800, maxX: 15000, minZ: 10300, maxZ: 10890 }, blend: 100, level: 60, relief: 0.3 };
export const WASTE_FLATS: readonly FlatDef[] = [WASTE_BASE_FLAT, GLASSLANDS_PLAIN, WASTE_NORTH_LIFT];

/**
 * The rim's crest runs this far outside the Caldera box (negative: inside it), so the crest itself stands behind the
 * hole's fog and the open Waste holds only its rising foot (Rimfoot at about 190 m).
 */
export const RIM_SPINE_OFFSET = -150;
export const RIM_CREST = 330;
const rimLoop = (): UpliftDef['spine'] => {
  const o = RIM_SPINE_OFFSET;
  const { x0, z0, x1, z1 } = CALDERA_BOX;
  const corners: XZ[] = [
    [x0 - o, z0 - o],
    [x1 + o, z0 - o],
    [x1 + o, z1 + o],
    [x0 - o, z1 + o],
    [x0 - o, z0 - o],
  ];
  return corners.map(([x, z]) => ({ x, z, height: RIM_CREST }));
};
/** The rise to the rim's foot: the crest stands just inside the Caldera hole; the open Waste climbs its outer flank. */
export const CALDERA_RIM: UpliftDef = { id: 'caldera-rim', spine: rimLoop(), radius: 900, crags: 25, profile: 1.4, ceiling: 520 };
export const WASTE_UPLIFTS: readonly UpliftDef[] = [CALDERA_RIM];

// ---- roads and rope-lines (plan 1.3)

const road = (id: string, points: readonly XZ[], halfWidth: number, blend: number, maxGrade: number, startTaper = 0): RoadDef => ({
  id,
  points: points.map(([x, z]) => ({ x, z })),
  halfWidth,
  blend,
  maxGrade,
  startTaper,
  maxSideSlope: 0.6,
  // Cut sides through the dunes and mesas: a long blend would touch a line's own next leg.
  maxBlend: 60,
});

/** The Ash Road: the north-east gate, out past the Underways junction, through `fog.ashen-waste` (9900, 3970), to Ashgate. */
export const ASH_ROAD_POINTS: readonly XZ[] = [NE_GATE, [8900, 2829], ASH_ROAD_JUNCTION, [9520, 3500], [9880, 3930], [9950, 4250], [10000, 4440]];
export const UNDERWAYS_EXIT_TRACK_POINTS: readonly XZ[] = [UNDERWAYS_EXIT, [9030, 3190], ASH_ROAD_JUNCTION];

/** Rope-line ids (L0's `RopeLineDef.id`). */
export type RopeLineId = 'rope.cinder-road-north' | 'rope.ashgate-camp' | 'rope.camp-chapel' | 'rope.camp-crossing' | 'rope.crossing-glasslands' | 'rope.glasslands-cathedral';

export const ROPE_POINTS: Readonly<Record<RopeLineId, readonly XZ[]>> = {
  'rope.cinder-road-north': [[10000, 4470], [10150, 4800], [10380, 5050], CROSSING, [10600, 5650], [10800, 5950], [10920, 6100], RIMFOOT],
  'rope.ashgate-camp': [[9980, 4475], [9600, 4800], [9200, 5150], [8800, 5500], [8550, 5750], WALKER_CAMP],
  'rope.camp-chapel': [WALKER_CAMP, [8150, 6400], [8050, 6950], [8150, 7500], [7980, 7900], CINDER_CHAPEL],
  'rope.camp-crossing': [WALKER_CAMP, [8900, 5750], [9400, 5600], R24_SPRING, [10150, 5380], CROSSING],
  'rope.crossing-glasslands': [CROSSING, [11000, 5250], [11600, 5350], [12200, 5450], [12800, 5600], GLASSLANDS],
  'rope.glasslands-cathedral': [GLASSLANDS, [13550, 6200], [13700, 6800], [13650, 7400], HUSK_CATHEDRAL],
};
/** Fitting order: the Cinder Road North first, so the camp's line to the Crossing ends on it. */
export const ROPE_LINE_IDS: readonly RopeLineId[] = ['rope.cinder-road-north', 'rope.ashgate-camp', 'rope.camp-chapel', 'rope.camp-crossing', 'rope.crossing-glasslands', 'rope.glasslands-cathedral'];
export const ROPE_HALF_WIDTH = 3;
export const ROPE_MAX_GRADE = 0.14;

export const ASH_ROAD: RoadDef = road('ash-road', ASH_ROAD_POINTS, 4, 20, 0.1);
export const UNDERWAYS_EXIT_TRACK: RoadDef = road('underways-exit', UNDERWAYS_EXIT_TRACK_POINTS, 3, 15, 0.1);
export const ROPE_ROADS: readonly RoadDef[] = ROPE_LINE_IDS.map((id) => road(id.replace('rope.', 'rope-'), ROPE_POINTS[id], id === 'rope.cinder-road-north' ? 3.5 : ROPE_HALF_WIDTH, 15, ROPE_MAX_GRADE));
/** After every shipped road, so none of them moves; the exit track after the Ash Road it joins. */
export const WASTE_ROADS: readonly RoadDef[] = [ASH_ROAD, UNDERWAYS_EXIT_TRACK, ...ROPE_ROADS];

// ---- the dunes (plan 3 item 5)

/** Largest dune height either side of the mean (metres), its wavelength along the wind, and the glass plain's share. */
export const DUNE_AMPLITUDE = 5;
export const DUNE_WAVELENGTH = 200;
export const DUNE_LEE_SHARE = 0.25;
export const DUNE_PLAIN_SCALE = 0.2;
/** Clear of a lane or site by this much, then a fade over DUNE_FADE. */
export const DUNE_KEEP_CLEAR = 12;
export const DUNE_FADE = 30;
/** Fade in from the Waste's edge and out toward the Caldera hole. */
export const DUNE_EDGE_FADE = 300;
/** Wind toward the east-north-east: dunes' crests run north-north-west to south-south-east. */
const WIND = { x: Math.cos((20 * Math.PI) / 180), z: Math.sin((20 * Math.PI) / 180) };

const duneWarp = createNoise2D(TERRAIN.seed + 41);
const duneField = createNoise2D(TERRAIN.seed + 42);
const dunePhase = createNoise2D(TERRAIN.seed + 43);

function smoothstep(e0: number, e1: number, x: number): number {
  const t = Math.min(Math.max((x - e0) / (e1 - e0), 0), 1);
  return t * t * (3 - 2 * t);
}

function boxDistance(b: { x0: number; z0: number; x1: number; z1: number }, x: number, z: number): number {
  const dx = Math.max(b.x0 - x, 0, x - b.x1);
  const dz = Math.max(b.z0 - z, 0, z - b.z1);
  return Math.hypot(dx, dz);
}

/** A keep-flat zone: a segment with a half width (lanes) or a rectangle (sites). */
interface Zone {
  ax: number;
  az: number;
  bx: number;
  bz: number;
  /** Half width (segments) or 0 (rectangles use the box between a and b). */
  hw: number;
  rect: boolean;
}

const zones: Zone[] = [];
for (const r of WASTE_ROADS) {
  for (let i = 1; i < r.points.length; i++) {
    const a = r.points[i - 1];
    const b = r.points[i];
    zones.push({ ax: a.x, az: a.z, bx: b.x, bz: b.z, hw: r.halfWidth, rect: false });
  }
}
for (const p of WASTE_PLATEAUS) zones.push({ ax: p.box.minX, az: p.box.minZ, bx: p.box.maxX, bz: p.box.maxZ, hw: 0, rect: true });

function zoneDistance(zn: Zone, x: number, z: number): number {
  if (zn.rect) return boxDistance({ x0: zn.ax, z0: zn.az, x1: zn.bx, z1: zn.bz }, x, z);
  const dx = zn.bx - zn.ax;
  const dz = zn.bz - zn.az;
  const len2 = dx * dx + dz * dz;
  const t = len2 > 0 ? Math.max(0, Math.min(1, ((x - zn.ax) * dx + (z - zn.az) * dz) / len2)) : 0;
  return Math.max(0, Math.hypot(x - zn.ax - dx * t, z - zn.az - dz * t) - zn.hw);
}

/** Bucket grid over the Waste: each cell lists the zones within reach of it, so a sample checks only a few. */
const CELL = 200;
const REACH = DUNE_KEEP_CLEAR + DUNE_FADE;
const COLS = Math.ceil((WASTE_BOX.x1 - WASTE_BOX.x0) / CELL);
const ROWS = Math.ceil((WASTE_BOX.z1 - WASTE_BOX.z0) / CELL);
let buckets: Zone[][] | null = null;

function buildBuckets(): Zone[][] {
  // Shelters stand 9 m off their line with a 6 m radius, inside the lane's keep-clear band, so they need no zone.
  const all = zones;
  const out: Zone[][] = Array.from({ length: COLS * ROWS }, () => []);
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const cx = WASTE_BOX.x0 + (c + 0.5) * CELL;
      const cz = WASTE_BOX.z0 + (r + 0.5) * CELL;
      // A zone matters to the cell when it passes within REACH of any point of it (half the diagonal from the centre).
      const lim = REACH + CELL * Math.SQRT1_2;
      for (const zn of all) if (zoneDistance(zn, cx, cz) <= lim) out[r * COLS + c].push(zn);
    }
  }
  return out;
}

/** 0 inside a keep-flat zone (lane, site, shelter) plus DUNE_KEEP_CLEAR, 1 beyond the fade. */
export function duneOpenness(x: number, z: number): number {
  const c = Math.floor((x - WASTE_BOX.x0) / CELL);
  const r = Math.floor((z - WASTE_BOX.z0) / CELL);
  if (c < 0 || r < 0 || c >= COLS || r >= ROWS) return 1;
  buckets ??= buildBuckets();
  let open = 1;
  for (const zn of buckets[r * COLS + c]) {
    const d = zoneDistance(zn, x, z);
    if (d <= DUNE_KEEP_CLEAR) return 0;
    if (d < REACH) open = Math.min(open, smoothstep(DUNE_KEEP_CLEAR, REACH, d));
  }
  return open;
}

/** 1 deep in the Waste, 0 at its edge and inside the Caldera hole, faded over DUNE_EDGE_FADE. */
export function duneEdgeWeight(x: number, z: number): number {
  const b = WASTE_BOX;
  const inside = Math.min(x - b.x0, b.x1 - x, z - b.z0, b.z1 - z);
  if (inside <= 0) return 0;
  const c = CALDERA_BOX;
  const inHole = x >= c.x0 && x < c.x1 && z >= c.z0 && z < c.z1;
  if (inHole) return 0;
  return smoothstep(0, DUNE_EDGE_FADE, inside) * smoothstep(0, DUNE_EDGE_FADE, boxDistance(c, x, z));
}

/** The dune profile along the wind: a long windward rise and a short lee fall, centred on 0, in [-1, 1]. */
export function duneProfile(s: number): number {
  const f = s - Math.floor(s);
  const up = 1 - DUNE_LEE_SHARE;
  const h = f < up ? smoothstep(0, up, f) : 1 - smoothstep(up, 1, f);
  return h * 2 - 1;
}

/** The dunes in metres at (x, z): 0 outside the Waste, in the Caldera hole and on every lane and site. Worker-safe. */
export function wasteRelief(x: number, z: number): number {
  if (x < WASTE_BOX.x0 || x >= WASTE_BOX.x1 || z < WASTE_BOX.z0 || z >= WASTE_BOX.z1) return 0;
  const edge = duneEdgeWeight(x, z);
  if (edge <= 0) return 0;
  const open = duneOpenness(x, z);
  if (open <= 0) return 0;
  // Region-local coordinates: far from the origin the patterns stay exact (A0's far-precision rule).
  const lx = x - WASTE_ORIGIN.x;
  const lz = z - WASTE_ORIGIN.z;
  const wx = lx + duneWarp(lx / 900, lz / 900) * 120;
  const wz = lz + duneWarp(lx / 900 + 17.3, lz / 900 - 9.1) * 120;
  const along = wx * WIND.x + wz * WIND.z;
  const across = -wx * WIND.z + wz * WIND.x;
  const s = along / DUNE_WAVELENGTH + dunePhase(across / 600, along / 1400) * 0.6;
  // Dune fields and bare flats: a low-frequency mask, never quite 0 so the ground is never glassy-flat.
  const field = 0.25 + 0.75 * smoothstep(-0.3, 0.5, duneField(lx / 1600, lz / 1600));
  const plain = 1 - (1 - DUNE_PLAIN_SCALE) * (1 - smoothstep(0, GLASSLANDS_PLAIN.blend, boxDistance(plainBox, x, z)));
  return DUNE_AMPLITUDE * duneProfile(s) * field * plain * edge * open;
}

const plainBox = { x0: GLASSLANDS_PLAIN.box.minX, z0: GLASSLANDS_PLAIN.box.minZ, x1: GLASSLANDS_PLAIN.box.maxX, z1: GLASSLANDS_PLAIN.box.maxZ };

/** The shaper box form of the Waste (tests). */
export const WASTE_SHAPE_BOX: ShapeBox = { minX: WASTE_BOX.x0, maxX: WASTE_BOX.x1, minZ: WASTE_BOX.z0, maxZ: WASTE_BOX.z1 };
