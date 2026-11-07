// Act 5 thread N1 PR 1: the Sunforge Caldera's terrain (plans/act5-N1.md section 2). Plain data and maths with no THREE,
// so the terrain workers load it. The master positions every Act 5 thread imports are in src/caldera/calderaSites.ts,
// which re-exports these with their names; nothing here is placed twice.
//
// Act 4's `caldera-rim` uplift (waste.ts) is not changed: its crest stands at 326 m, 1350 m from the Anvil on the axes.
// Inside it the bowl falls in three steps: the rim shelf (300 m, the Rim Camp), the terraces ring (about 225 m, with the
// Wyrm Terraces' ledges on the east wall) and the floor (178 m) behind the floor wall at r 470 to 520. The lava lake is a
// ring (r 100 to 250, surface 140) round a round island (r 50, 160 m), crossed on the south by a causeway. Outside the rim
// the rim stairs climb from Rimfoot to the Rim Gate, which stands in a cut through the crest.
import type { FlatDef, PlateauDef, RoadDef, TroughDef } from '../shaping';

export type XZ = readonly [number, number];

/** The Anvil of Ages, the bowl's centre (v0.9 `CALDERA_CENTRE`). */
export const ANVIL: XZ = [11000, 8000];

// ---- the floor, the lake and the island

/** The floor wall: the floor's flat ends at FLOOR_RADIUS and the wall rises to the terraces ring by FLOOR_WALL_RADIUS. */
export const FLOOR_RADIUS = 470;
export const FLOOR_WALL_RADIUS = 520;
export const FLOOR_HEIGHT = 178;
/** The terraces ring's target height (the middle step). */
export const RING_HEIGHT = 225;

export const LAKE_RING_R = 175;
export const LAKE_HALF_WIDTH = 80;
export const LAKE_INNER_R = LAKE_RING_R - LAKE_HALF_WIDTH;
export const LAKE_OUTER_R = LAKE_RING_R + LAKE_HALF_WIDTH;
export const LAKE_SURFACE = 140;
export const LAKE_FLOOR = 136;
export const LAKE_POINTS = 24;
/** The lake's centre line: a closed ring of LAKE_POINTS + 1 points (the first repeated), counter-clockwise from +X. */
export const LAKE_RING: readonly XZ[] = Array.from({ length: LAKE_POINTS + 1 }, (_, i) => {
  const a = ((i % LAKE_POINTS) * 2 * Math.PI) / LAKE_POINTS;
  return [Math.round((ANVIL[0] + LAKE_RING_R * Math.cos(a)) * 100) / 100, Math.round((ANVIL[1] + LAKE_RING_R * Math.sin(a)) * 100) / 100] as XZ;
});

export const ISLAND_R = 50;
export const ISLAND_HEIGHT = 160;
export const ISLAND_BLEND = 50;

/** The causeway across the lake's south arc, from the floor to the island's edge (walkable from M53; D10's hole holds it). */
export const CAUSEWAY_POINTS: readonly XZ[] = [
  [11000, 7700],
  [11000, 7955],
];
export const CAUSEWAY_HALF_WIDTH = 5;

// ---- the rim shelf, the gate cut and the gates

/** The Rim Gate stands on the shipped `fog.caldera-rim.s` line (the Caldera box's south edge minus 30 m). */
export const RIM_GATE: XZ = [11000, 6470];
export const GATE_CUT_HALF_WIDTH = 14;
export const RIM_SHELF_HEIGHT = 295;
/** Where the rim stairs arrive (their 0.16 grade from Rimfoot); the cut climbs from here to the shelf at 0.056. */
export const RIM_GATE_LANDING_HEIGHT = 281;
export const INNER_GATE_HEAD_HEIGHT = RING_HEIGHT;

// ---- the stairs and the paths (engine x, z)

/** The rim stairs: Rimfoot's north edge, east along the outer flank, one hairpin straight up the slope, west to the gate. */
export const RIM_STAIRS_POINTS: readonly XZ[] = [
  [11000, 6258],
  [11180, 6280],
  [11400, 6305],
  [11420, 6385],
  [11180, 6425],
  [11030, 6446],
  [11000, 6458],
];
export const RIM_STAIRS_HALF_WIDTH = 4;
/** The Lava Stair: from the Rim Camp's north edge down the south inner wall to the Cooling Hall's apron. */
export const LAVA_STAIR_POINTS: readonly XZ[] = [
  [11000, 6812],
  [11030, 6990],
  [11100, 7170],
  [11140, 7330],
  [11150, 7395],
];
/** The Inner Gate ramp: from the ring's apron through the floor wall to the floor. */
export const INNER_GATE_RAMP_POINTS: readonly XZ[] = [
  [11000, 7445],
  [11000, 7600],
];
/** The camp's west path to the old stokers' tunnel. */
export const TUNNEL_PATH_POINTS: readonly XZ[] = [
  [10872, 6760],
  [10700, 6830],
  [10566, 6945],
];
/** The ring path: the Lava Stair's foot east along the terraces ring to the foot of the Wyrm Terraces. */
export const TERRACE_PATH_POINTS: readonly XZ[] = [
  [11175, 7402],
  [11450, 7500],
  [11800, 7600],
  [11980, 7640],
];
/**
 * The Wyrm Terraces: three shelves cut along the east inner wall's contours (north, then south, then south), joined by
 * climbs straight up the wall; the legs stand 80 m apart, so the shaper's hairpin rule holds.
 */
export const TERRACES_POINTS: readonly XZ[] = [
  [11980, 7640],
  [12070, 7700],
  [12070, 7900],
  [12150, 8000],
  [12150, 7700],
  [12230, 7600],
  [12230, 7400],
];
export const TERRACES_HALF_WIDTH = 7;

// ---- the terraces ledges, the aprons

/** The three shelves: their middle points (the waystone on the middle one). Heights are the fitted road's (tests pin them). */
export const TERRACE_LEDGES: readonly { id: string; at: XZ }[] = [
  { id: 'terrace.1', at: [12070, 7800] },
  { id: 'terrace.2', at: [12150, 7850] },
  { id: 'terrace.3', at: [12230, 7500] },
];

export const COOLING_HALL_DOOR: XZ = [11150, 7420];
export const TUNNEL_MOUTH: XZ = [10550, 6955];
export const STOKERS_POST: XZ = [11230, 6750];
/** The warhost camp set on the Waste plain south-east of Rimfoot (after M51). */
export const WARHOST_CAMP: XZ = [11600, 5800];

// ---- shaper defs

const box = (minX: number, maxX: number, minZ: number, maxZ: number) => ({ minX, maxX, minZ, maxZ });
const plateau = (id: string, minX: number, maxX: number, minZ: number, maxZ: number, height: number, blend: number, round?: true): PlateauDef => ({
  id,
  box: box(minX, maxX, minZ, maxZ),
  height,
  blend,
  ...(round ? { round } : {}),
});
const road = (id: string, points: readonly XZ[], halfWidth: number, blend: number, maxGrade: number, extra: Partial<RoadDef> = {}): RoadDef => ({
  id,
  points: points.map(([x, z]) => ({ x, z })),
  halfWidth,
  blend,
  maxGrade,
  startTaper: 0,
  maxSideSlope: 0.6,
  maxBlend: 30,
  ...extra,
});

/**
 * The terraces ring and the floor: one flat over the bowl's middle, whose relief is pressed toward RING_HEIGHT, with the
 * floor as a round bowl inside it. Applied before the rim's uplift, so the uplift's inner flank still rises from the ring
 * to the crest. Its reach (the box plus its blend) stops at z 9200, clear of N2's interior pad (z 9250 to 9450).
 */
export const CALDERA_RING_FLAT: FlatDef = {
  id: 'caldera-ring',
  box: box(10050, 11950, 7050, 8950),
  blend: 250,
  level: 244,
  relief: 0.15,
  bowls: [{ x: ANVIL[0], z: ANVIL[1], radius: FLOOR_RADIUS + 15, floor: FLOOR_HEIGHT, shelfWidth: 0, shelfFloor: FLOOR_HEIGHT, blend: FLOOR_WALL_RADIUS - FLOOR_RADIUS - 15 }],
};
export const CALDERA_FLATS: readonly FlatDef[] = [CALDERA_RING_FLAT];

export const CALDERA_LAKE: TroughDef = {
  id: 'caldera-lake',
  points: LAKE_RING.map(([x, z]) => ({ x, z, floor: LAKE_FLOOR })),
  halfWidth: LAKE_HALF_WIDTH,
  // Wide on purpose: on the island side the blend runs under the island's own blend, so the shore falls smoothly.
  blend: 45,
};
/** The cutting through the crest the Rim Gate stands in. */
export const CALDERA_GATE_CUT: TroughDef = {
  id: 'caldera-gate-cut',
  points: [
    { x: RIM_GATE[0], z: 6440, floor: RIM_GATE_LANDING_HEIGHT },
    { x: RIM_GATE[0], z: 6690, floor: RIM_SHELF_HEIGHT },
  ],
  halfWidth: GATE_CUT_HALF_WIDTH,
  blend: 25,
};
export const CALDERA_TROUGHS: readonly TroughDef[] = [CALDERA_LAKE, CALDERA_GATE_CUT];

export const ISLAND_PLATEAU = plateau('caldera-island', ANVIL[0] - ISLAND_R, ANVIL[0] + ISLAND_R, ANVIL[1] - ISLAND_R, ANVIL[1] + ISLAND_R, ISLAND_HEIGHT, ISLAND_BLEND, true);
export const RIM_CAMP_PLATEAU = plateau('caldera-rim-camp', 10870, 11130, 6680, 6810, RIM_SHELF_HEIGHT, 180);
export const STOKERS_PLATEAU = plateau('caldera-stokers', 11195, 11265, 6725, 6775, 305, 70);
export const TUNNEL_APRON = plateau('caldera-tunnel-apron', 10530, 10570, 6940, 6970, 238, 90);
export const INNER_GATE_HEAD = plateau('caldera-inner-gate-head', 10960, 11060, 7400, 7445, INNER_GATE_HEAD_HEIGHT, 40);
export const COOLING_APRON = plateau('caldera-cooling-apron', 11125, 11175, 7390, 7418, 226, 40);
export const WARHOST_PLATEAU = plateau('caldera-warhost', 11450, 11750, 5700, 5900, 72, 80);

/** Inside the Caldera box. */
export const CALDERA_PLATEAUS: readonly PlateauDef[] = [ISLAND_PLATEAU, RIM_CAMP_PLATEAU, STOKERS_PLATEAU, TUNNEL_APRON, INNER_GATE_HEAD, COOLING_APRON];
/** On the Waste side of the rim (the dunes keep off them: waste.ts reads CALDERA_WASTE_SIDE_ZONES). */
export const CALDERA_WASTE_SIDE_PLATEAUS: readonly PlateauDef[] = [WARHOST_PLATEAU];

export const RIM_STAIRS_ROAD = road('caldera-rim-stairs', RIM_STAIRS_POINTS, RIM_STAIRS_HALF_WIDTH, 12, 0.16);
export const LAVA_STAIR_ROAD = road('caldera-lava-stair', LAVA_STAIR_POINTS, 3, 15, 0.18);
export const INNER_GATE_RAMP = road('caldera-inner-gate-ramp', INNER_GATE_RAMP_POINTS, 6, 15, 0.34);
export const CAUSEWAY_ROAD = road('caldera-causeway', CAUSEWAY_POINTS, CAUSEWAY_HALF_WIDTH, 10, 0.12, { minHeight: ISLAND_HEIGHT });
export const TUNNEL_PATH = road('caldera-tunnel-path', TUNNEL_PATH_POINTS, 2.5, 15, 0.2);
export const TERRACE_PATH = road('caldera-terrace-path', TERRACE_PATH_POINTS, 2.5, 15, 0.2);
export const TERRACES_ROAD = road('caldera-terraces', TERRACES_POINTS, TERRACES_HALF_WIDTH, 15, 0.32);
/** After every shipped road, so none of them moves. */
export const CALDERA_ROADS: readonly RoadDef[] = [RIM_STAIRS_ROAD, LAVA_STAIR_ROAD, INNER_GATE_RAMP, CAUSEWAY_ROAD, TUNNEL_PATH, TERRACE_PATH, TERRACES_ROAD];

/** The Waste-side Caldera features the dunes keep clear of (lanes as segments, plateaus as boxes). */
export const CALDERA_WASTE_SIDE_ZONES = {
  roads: [RIM_STAIRS_ROAD],
  plateaus: CALDERA_WASTE_SIDE_PLATEAUS,
} as const;
