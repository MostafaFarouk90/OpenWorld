// Act 3 thread K1 owns this data (contracts/heightfield.md "Terrain shaping", v0.7): the Greyfen Marches pressed to a
// marsh around a 6 m water table, Hathren's Mere, the ferry channels, the causeways, the Fen Road and the Fen Track.
// Types only, so the terrain workers can load it. Siblings import these constants, never copies (plans/act3-K1.md).
import type { FlatDef, PlateauDef, RoadDef, ShapeBox, TroughDef } from '../shaping';
import type { RoadPolyline } from './cinderRoad';

/** The Greyfen's water table: every fen water plane's surface (engine metres). */
export const GREYFEN_WATER_TABLE = 6;
/** Wading floors sit here (0.8 m of water); the shaped fen never dips under WADE_FLOOR_MIN outside the Mere and channels. */
export const WADE_FLOOR = 5.2;
export const WADE_FLOOR_MIN = 4.8;
/** Deck height of the causeways (a metre above the water). */
export const CAUSEWAY_DECK = 7;
/** Bed of the ferry channels (2 m of water under the surface). */
export const CHANNEL_BED = 4;

const box = (cx: number, cz: number, w: number, d: number): ShapeBox => ({ minX: cx - w / 2, maxX: cx + w / 2, minZ: cz - d / 2, maxZ: cz + d / 2 });

/** Hathren's Mere (plan 3.5): deep inside `radius`, a wading shelf outside it, dry ground past the blend. */
export const HATHRENS_MERE = { x: 3000, z: 12500, radius: 330, floor: 3, shelfWidth: 50, shelfFloor: WADE_FLOOR, blend: 60 } as const;

/** The whole marsh: ridges pressed away, ground about 6.6 to 14 m, bog pools at wading depth. */
export const GREYFEN_MARSH: FlatDef = {
  id: 'greyfen-marsh',
  box: { minX: -500, maxX: 6500, minZ: 9500, maxZ: 15500 },
  blend: 500,
  level: 10,
  relief: 0.05,
  maxRise: 4,
  pools: { floor: WADE_FLOOR, scale: 170, cover: 0.16 },
  bowls: [HATHRENS_MERE],
};

/** The strip between Brightwater and the Ashen Waste that carries the Fen Road north: rolling ground, no ridges. */
export const FEN_ROAD_STRIP: FlatDef = {
  id: 'fen-road-strip',
  box: { minX: 5800, maxX: 6800, minZ: 4300, maxZ: 9400 },
  blend: 200,
  level: 22,
  relief: 0.25,
  maxRise: 26,
};

/** Wading reed-bed ground 60 to 120 m either side of the Reedgate causeway, 400 to 900 m north of Reedgate (K3). */
export const REEDBED_WEST: FlatDef = { id: 'reedbeds-west', box: { minX: 2990, maxX: 3050, minZ: 10600, maxZ: 11100 }, blend: 15, level: WADE_FLOOR, relief: 0 };
export const REEDBED_EAST: FlatDef = { id: 'reedbeds-east', box: { minX: 3230, maxX: 3290, minZ: 10600, maxZ: 11100 }, blend: 15, level: WADE_FLOOR, relief: 0 };

export const GREYFEN_FLATS: readonly FlatDef[] = [GREYFEN_MARSH, FEN_ROAD_STRIP, REEDBED_WEST, REEDBED_EAST];

// ---- ferry channels (stops agreed with K7: act3Places.ts ACT3_FERRY)
const channel = (id: string, pts: RoadPolyline): TroughDef => ({ id, points: pts.map(([x, z]) => ({ x, z, floor: CHANNEL_BED })), halfWidth: 12, blend: 14 });

/** Reedgate Ferry landing north to the Mere's south jetty, ending inside the Mere's deep water. */
export const FERRY_REEDGATE_MERE_POINTS: RoadPolyline = [
  [3600, 10100],
  [3480, 10700],
  [3420, 11350],
  [3150, 11900],
  [3060, 12190],
];
/** From the Mere's north-east water to the Greywatch landing. */
export const FERRY_MERE_GREYWATCH_POINTS: RoadPolyline = [
  [3170, 12790],
  [3380, 13350],
  [3300, 13900],
  [2800, 14250],
];
/** From the Mere's east water to the Mireweather Hut landing. */
export const FERRY_MERE_MIREWEATHER_POINTS: RoadPolyline = [
  [3300, 12560],
  [3900, 12720],
  [4700, 12660],
  [5500, 12350],
];
export const FERRY_CHANNELS: readonly TroughDef[] = [
  channel('ferry-reedgate-mere', FERRY_REEDGATE_MERE_POINTS),
  channel('ferry-mere-greywatch', FERRY_MERE_GREYWATCH_POINTS),
  channel('ferry-mere-mireweather', FERRY_MERE_MIREWEATHER_POINTS),
];

/** Under each causeway gap: a short cut to wading depth, so water stands under K3's plank bridges. */
const gapTrough = (id: string, a: readonly [number, number], b: readonly [number, number]): TroughDef => ({
  id,
  points: [
    { x: a[0], z: a[1], floor: WADE_FLOOR },
    { x: b[0], z: b[1], floor: WADE_FLOOR },
  ],
  halfWidth: 6,
  blend: 6,
});

// ---- causeways (K3 lays plank decks over them): raised ground 4 m wide at the deck height
const causeway = (id: string, points: RoadPolyline, gaps: readonly { arc: number; halfLength: number }[] = []): RoadDef => ({
  id,
  points: points.map(([x, z]) => ({ x, z })),
  halfWidth: 2,
  blend: 6,
  // Steep only where a gap drops the deck into the water; elsewhere the deck is level.
  maxGrade: 0.45,
  startTaper: 0,
  maxSideSlope: 0.8,
  maxBlend: 20,
  minHeight: CAUSEWAY_DECK,
  gaps,
});

export const CAUSEWAY_REEDGATE_MERE_POINTS: RoadPolyline = [
  [3160, 10265],
  [3140, 10800],
  [3060, 11450],
  [3000, 12030],
];
export const CAUSEWAY_MERE_GREYWATCH_POINTS: RoadPolyline = [
  [2880, 12960],
  [2760, 13600],
  [2700, 14435],
];
export const CAUSEWAY_MERE_MIREWEATHER_POINTS: RoadPolyline = [
  [3470, 12380],
  [4400, 12420],
  [5565, 12310],
];

const polyLength = (pts: RoadPolyline): number => {
  let len = 0;
  for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  return len;
};
const pointAt = (pts: RoadPolyline, s: number): readonly [number, number] => {
  let arc = 0;
  for (let i = 1; i < pts.length; i++) {
    const len = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    if (s <= arc + len || i === pts.length - 1) {
      const t = Math.min(Math.max((s - arc) / len, 0), 1);
      return [pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * t, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * t];
    }
    arc += len;
  }
  return pts[pts.length - 1];
};

/** M23's two plank-bridge gaps on the Reedgate causeway, at 35% and 70% of its arc, 8 m long (K3). */
export const CAUSEWAY_GAPS: readonly { causewayId: 'causeway-reedgate-mere'; arc: number; halfLength: number }[] = [0.35, 0.7].map((f) => ({
  causewayId: 'causeway-reedgate-mere' as const,
  arc: Math.round(polyLength(CAUSEWAY_REEDGATE_MERE_POINTS) * f),
  halfLength: 4,
}));

/** The shaped dip under each gap is wider than the bridge, so open water spans at least the 8 m bridge. */
export const GAP_CUT_HALF_LENGTH = 7;
export const CAUSEWAY_REEDGATE_MERE = causeway(
  'causeway-reedgate-mere',
  CAUSEWAY_REEDGATE_MERE_POINTS,
  CAUSEWAY_GAPS.map((gp) => ({ arc: gp.arc, halfLength: GAP_CUT_HALF_LENGTH })),
);
export const CAUSEWAY_MERE_GREYWATCH = causeway('causeway-mere-greywatch', CAUSEWAY_MERE_GREYWATCH_POINTS);
export const CAUSEWAY_MERE_MIREWEATHER = causeway('causeway-mere-mireweather', CAUSEWAY_MERE_MIREWEATHER_POINTS);

const GAP_TROUGHS: readonly TroughDef[] = CAUSEWAY_GAPS.map((gp, i) => {
  const a = pointAt(CAUSEWAY_REEDGATE_MERE_POINTS, gp.arc - 1);
  const b = pointAt(CAUSEWAY_REEDGATE_MERE_POINTS, gp.arc + 1);
  // Across the causeway: perpendicular to it, 16 m long.
  const dx = b[0] - a[0];
  const dz = b[1] - a[1];
  const len = Math.hypot(dx, dz);
  const c = pointAt(CAUSEWAY_REEDGATE_MERE_POINTS, gp.arc);
  const nx = -dz / len;
  const nz = dx / len;
  return gapTrough(`causeway-gap-${i + 1}`, [c[0] - nx * 8, c[1] - nz * 8], [c[0] + nx * 8, c[1] + nz * 8]);
});

export const GREYFEN_TROUGHS: readonly TroughDef[] = [...FERRY_CHANNELS, ...GAP_TROUGHS];

// ---- plateaus (dry pads; the interior pads are act3Places.ts ACT3_INTERIOR_PADS)
const pad = (id: string, cx: number, cz: number, w: number, d: number, height: number, blend: number, hollow?: PlateauDef['hollow']): PlateauDef => ({
  id,
  box: box(cx, cz, w, d),
  height,
  blend,
  ...(hollow ? { hollow } : {}),
});

export const REEDGATE_PLATEAU = pad('reedgate', 3200, 10180, 160, 120, 7, 40);
/** The landing with M24's pit (K7): 12 x 10 m, 6 m deep, 30 m east of the landing point. */
export const REEDGATE_FERRY_PLATEAU = pad('reedgate-ferry', 3615, 10100, 70, 44, 7, 30, { box: box(3630, 10100, 12, 10), depth: 6 });
export const MERE_SHRINE_PLATEAU = pad('mere-shrine', 3000, 12045, 44, 30, 7, 25);
export const MIREWEATHER_HUT_PLATEAU = pad('mireweather-hut', 5600, 12300, 80, 60, 8, 40);
export const GREYWATCH_PLATEAU = pad('greywatch', 2700, 14460, 40, 40, 7, 25);
export const SUNKEN_CHAPEL_PLATEAU = pad('sunken-chapel', 2600, 14700, 68, 78, 7, 30);
export const MIREWATER_DEEPS_PLATEAU = pad('mirewater-deeps', 2300, 12000, 98, 118, 7, 30);

export const GREYFEN_PLATEAUS: readonly PlateauDef[] = [
  REEDGATE_PLATEAU,
  REEDGATE_FERRY_PLATEAU,
  MERE_SHRINE_PLATEAU,
  MIREWEATHER_HUT_PLATEAU,
  GREYWATCH_PLATEAU,
  SUNKEN_CHAPEL_PLATEAU,
  MIREWATER_DEEPS_PLATEAU,
];

// ---- roads
const road = (id: string, points: RoadPolyline, halfWidth: number, blend: number, maxGrade: number, startTaper = 0): RoadDef => ({
  id,
  points: points.map(([x, z]) => ({ x, z })),
  halfWidth,
  blend,
  maxGrade,
  startTaper,
  maxSideSlope: 0.6,
});

/**
 * Harrowmark's north-west gate, through the shipped `fog.greyfen` face (7800, 3970), bending west at once clear of the
 * Ashen Waste's corner (7000, 4500), north along the strip, the Greyfen corner, then west to Reedgate (plan 3.3).
 */
export const FEN_ROAD_POINTS: RoadPolyline = [
  [8150, 2735],
  [7950, 3400],
  [7800, 3970],
  [6600, 4600],
  [6450, 5600],
  [6550, 6800],
  [6400, 8000],
  [6300, 9400],
  [5200, 9700],
  [4200, 9900],
  [3500, 10030],
  [3285, 10135],
];
/** Dry from the Greyfen corner on (a metre above the water table): the arc of (6400, 8000). */
export const FEN_ROAD_DRY_FROM = Math.round(polyLength(FEN_ROAD_POINTS.slice(0, 7)));
export const FEN_ROAD: RoadDef = { ...road('fen-road', FEN_ROAD_POINTS, 5, 25, 0.08, 40), minHeight: GREYFEN_WATER_TABLE + 1, minHeightFrom: FEN_ROAD_DRY_FROM };

/** From the Fen Road east of the ferry channel, north-east to Mireweather Hut, where the Spine Road starts. */
export const FEN_TRACK_POINTS: RoadPolyline = [
  [4600, 9821],
  [5000, 10600],
  [5300, 11500],
  [5560, 12265],
];
export const FEN_TRACK: RoadDef = { ...road('fen-track', FEN_TRACK_POINTS, 3.5, 20, 0.08, 0), minHeight: GREYFEN_WATER_TABLE + 1 };

/** The causeways come after the roads, so a causeway never lifts a road. */
export const GREYFEN_ROADS: readonly RoadDef[] = [FEN_ROAD, FEN_TRACK, CAUSEWAY_REEDGATE_MERE, CAUSEWAY_MERE_GREYWATCH, CAUSEWAY_MERE_MIREWEATHER];
