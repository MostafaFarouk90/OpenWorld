// Act 3 thread K1 owns this data (contracts/heightfield.md "Terrain shaping", v0.7): the Dragonspine massif raised on
// the lowland (summit about 600 m under a 630 m soft ceiling), the Frostfang chasm, the site plateaus, the Rime Pass,
// the Skyhold spur, the Spine Road's east end and the Deepgate Track. Types only, so the terrain workers can load it.
// Fitted on the real `heightAt` with tools/act3-world/fit-dragonspine.ts; siblings import these constants, never copies.
import type { PlateauDef, RoadDef, ShapeBox, SpinePoint, TroughDef, UpliftDef } from '../shaping';
import type { RoadPolyline } from './cinderRoad';

const road = (id: string, points: RoadPolyline, halfWidth: number, blend: number, maxGrade: number, extra: Partial<RoadDef> = {}): RoadDef => ({
  id,
  points: points.map(([x, z]) => ({ x, z })),
  halfWidth,
  blend,
  maxGrade,
  startTaper: 0,
  maxSideSlope: 0.6,
  ...extra,
});

const spine = (pts: readonly (readonly [number, number, number])[]): SpinePoint[] => pts.map(([x, z, height]) => ({ x, z, height }));

/** A plateau `w` x `d` metres centred on (x, z). */
const pad = (id: string, x: number, z: number, w: number, d: number, height: number, blend: number): PlateauDef => ({
  id,
  box: { minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 },
  height,
  blend,
});

/** Every uplift's soft ceiling: the crown's peaks top out near 615 m, under `HEIGHT_RANGE.max` (640). */
export const DRAGONSPINE_CEILING = 630;

// ---- uplifts (each a ridge, a peak or a lift; every reach keeps out of the protected boxes: north of z 11000 where it
// spans x < 15000, west of x 17000 where it spans z < 12000). Applied in this order; the ground is their smooth max.

/** A low lip along the Waste's edge (under the fog face at z 11050): the lowland there never sinks toward the kill plane. */
export const DS_SOUTH_LIP: UpliftDef = { id: 'ds-south-lip', spine: spine([[12000, 11150, 4], [15800, 11150, 4]]), radius: 150, crags: 0, ceiling: DRAGONSPINE_CEILING };
/** The low gap between the Waste and Oldsmoke (x 15000 to 17000), lifted out of the kill plane's reach. */
export const DS_EAST_GAP_LIFT: UpliftDef = { id: 'ds-east-gap-lift', spine: spine([[15350, 10650, 2], [16650, 10650, 2]]), radius: 350, crags: 0, profile: 0.5, ceiling: DRAGONSPINE_CEILING };
/** The east foot: the low ground east of the lodge, so the Deepgate Track does not cross it on a causeway. */
export const DS_EAST_FOOT: UpliftDef = { id: 'ds-east-foot', spine: spine([[15650, 11400, 60], [15650, 12000, 110]]), radius: 650, crags: 20, ceiling: DRAGONSPINE_CEILING };
/** The foot: the lodge's shelf at about 120 m, fading out before z 11000. */
export const DS_FOOT: UpliftDef = {
  id: 'ds-foot',
  spine: spine([[12700, 12350, 85], [13600, 12300, 155], [15000, 12350, 150]]),
  radius: 1300,
  crags: 40,
  profile: 1.2,
  ceiling: DRAGONSPINE_CEILING,
};
/** The lower spine the Rime Pass climbs: the lodge, the shelter's shoulder, the Last Anvil. */
export const DS_LOWER_SPINE: UpliftDef = {
  id: 'ds-lower-spine',
  spine: spine([[13600, 12300, 155], [13300, 12650, 200], [13000, 13300, 252], [13600, 13400, 290], [14200, 13650, 345], [14700, 13900, 382], [15050, 13850, 365]]),
  radius: 750,
  crags: 100,
  profile: 0.8,
  ceiling: DRAGONSPINE_CEILING,
};
/** The ramp from the Last Anvil up to the summit gate and on to the Wyrm's Hearth. */
export const DS_ANVIL_RAMP: UpliftDef = {
  id: 'ds-anvil-ramp',
  spine: spine([[14700, 13900, 382], [14250, 14250, 420], [14800, 14550, 470], [13600, 14750, 575], [13600, 15450, 600]]),
  radius: 500,
  crags: 120,
  profile: 0.8,
  ceiling: DRAGONSPINE_CEILING,
};
/** The summit massif round the Wyrm's Hearth. */
export const DS_SUMMIT: UpliftDef = {
  id: 'ds-summit',
  spine: spine([[12900, 15350, 595], [13600, 15600, 612], [14250, 15650, 598]]),
  radius: 1200,
  crags: 150,
  profile: 0.5,
  ceiling: DRAGONSPINE_CEILING,
};
/** The crown: a crest of crags from north-west round to north-east of the summit plateau. */
export const DS_CROWN: UpliftDef = {
  id: 'ds-crown',
  spine: spine([[12500, 15850, 600], [12950, 16250, 630], [13300, 16350, 570], [13700, 16380, 628], [14150, 16250, 575], [14380, 15900, 630]]),
  radius: 500,
  crags: 220,
  profile: 1.6,
  ceiling: DRAGONSPINE_CEILING,
};
/** Skyhold: a mesa from the summit gate west to the cliff top, dropping hard on its west and north (low profile). */
export const DS_SKYHOLD: UpliftDef = {
  id: 'ds-skyhold',
  spine: spine([[12260, 15200, 600], [12700, 15050, 590], [13100, 14900, 585], [13600, 14750, 575]]),
  radius: 260,
  crags: 120,
  profile: 0.06,
  ceiling: DRAGONSPINE_CEILING,
};
/** The Hawk Cliffs: a block north of the cliff foot, its south face a 50 m scarp (low profile). */
export const DS_HAWK_CLIFFS: UpliftDef = {
  id: 'ds-hawk-cliffs',
  spine: spine([[10950, 13250, 100], [11850, 13250, 110]]),
  radius: 170,
  crags: 10,
  profile: 0.1,
  ceiling: DRAGONSPINE_CEILING,
};
/** The west ridge behind the Hawk Cliffs and the collapsed cave's slope. */
export const DS_WEST_RIDGE: UpliftDef = {
  id: 'ds-west-ridge',
  spine: spine([[10900, 13900, 260], [11300, 14150, 420], [11800, 14300, 330], [12250, 14400, 480], [12600, 14350, 400], [12550, 14080, 200]]),
  radius: 650,
  crags: 200,
  profile: 1.8,
  ceiling: DRAGONSPINE_CEILING,
};
/** The east ridge from the Anvil's shoulder past the Aerie to the peak east of it, then down toward the north-east corner. */
export const DS_EAST_RIDGE: UpliftDef = {
  id: 'ds-east-ridge',
  spine: spine([[15300, 13600, 330], [15600, 14100, 520], [15900, 14600, 430], [16200, 15100, 600], [16300, 15600, 500], [16500, 16300, 630], [17000, 16800, 400], [17400, 15900, 240]]),
  radius: 720,
  crags: 220,
  profile: 1.8,
  ceiling: DRAGONSPINE_CEILING,
};
/** Frostfang Aerie's shelf, east of the chasm (shouldered: steep edges). */
export const DS_AERIE: UpliftDef = {
  id: 'ds-aerie',
  spine: spine([[15530, 15960, 565], [15760, 16140, 565]]),
  radius: 430,
  crags: 20,
  profile: 0.06,
  ceiling: DRAGONSPINE_CEILING,
};
/** M28's crag: a lower peak east of the pass above the lodge. */
export const DS_M28_CRAG: UpliftDef = {
  id: 'ds-m28-crag',
  spine: spine([[14250, 12700, 285]]),
  radius: 600,
  crags: 90,
  profile: 1.3,
  ceiling: DRAGONSPINE_CEILING,
};

export const DRAGONSPINE_UPLIFTS: readonly UpliftDef[] = [
  DS_SOUTH_LIP,
  DS_EAST_GAP_LIFT,
  DS_FOOT,
  DS_EAST_FOOT,
  DS_LOWER_SPINE,
  DS_ANVIL_RAMP,
  DS_SUMMIT,
  DS_CROWN,
  DS_SKYHOLD,
  DS_HAWK_CLIFFS,
  DS_WEST_RIDGE,
  DS_EAST_RIDGE,
  DS_AERIE,
  DS_M28_CRAG,
];

// ---- the Frostfang chasm

/** Between the summit and the Aerie, x 14500 to 15000: the Aerie is reached only by glide. */
export const FROSTFANG_CHASM: TroughDef = {
  id: 'frostfang-chasm',
  points: [
    { x: 14750, z: 15150, floor: 330 },
    { x: 14750, z: 15700, floor: 300 },
    { x: 14780, z: 16400, floor: 300 },
    { x: 14800, z: 17000, floor: 310 },
  ],
  halfWidth: 90,
  blend: 90,
};
/** The gully round the Aerie's south and east sides, so no slope walks up onto the shelf from the summit's flank or the east ridge. */
export const FROSTFANG_MOAT: TroughDef = {
  id: 'frostfang-moat',
  points: [
    { x: 14750, z: 15330, floor: 300 },
    { x: 15300, z: 15400, floor: 310 },
    { x: 16100, z: 15520, floor: 330 },
    { x: 16350, z: 16100, floor: 340 },
    { x: 16300, z: 16750, floor: 300 },
  ],
  halfWidth: 50,
  blend: 70,
};
export const DRAGONSPINE_TROUGHS: readonly TroughDef[] = [FROSTFANG_CHASM, FROSTFANG_MOAT];

// ---- plateaus (ids agreed with K4)

export const WYRMWATCH_LODGE_PLATEAU = pad('wyrmwatch-lodge', 13600, 11900, 140, 110, 120, 150);
export const RIME_PASS_SHELTER_PLATEAU = pad('rime-pass-shelter', 13000, 13300, 70, 60, 250, 100);
export const LAST_ANVIL_PLATEAU = pad('last-anvil', 14700, 13900, 120, 100, 380, 50);
export const HAWK_CLIFFS_FOOT_PLATEAU = pad('hawk-cliffs-foot', 11400, 13000, 80, 60, 27, 40);
export const COLLAPSED_CAVE_PLATEAU = pad('collapsed-cave', 12300, 13700, 40, 30, 53, 40);
export const M28_CRAG_PLATEAU = pad('m28-crag', 14250, 12700, 30, 30, 282, 60);
export const SUMMIT_GATE_PLATEAU = pad('summit-gate', 13600, 14750, 60, 50, 575, 60);
export const WYRMS_HEARTH_PLATEAU = pad('wyrms-hearth', 13600, 15600, 300, 250, 600, 150);
export const SKYHOLD_TOP_PLATEAU = pad('skyhold-top', 12230, 15200, 100, 80, 585, 50);
export const FROSTFANG_AERIE_PLATEAU = pad('frostfang-aerie', 15600, 16040, 220, 240, 555, 80);
/** The Frostfang keep's interior pad (40 x 50 m), exactly flat, on the Aerie shelf. */
export const FROSTFANG_KEEP_PLATEAU = pad('frostfang-keep', 15600, 16120, 40, 50, 555, 40);

/** The Wyrmwatch hall's 30 x 20 m interior pad, inside the lodge plateau (which keeps it flat). */
export const WYRMWATCH_HALL_PAD: ShapeBox = { minX: 13585, maxX: 13615, minZ: 11910, maxZ: 11930 };
/** The Frostfang waystone, on the Aerie shelf. */
export const FROSTFANG_WAYSTONE = { x: 15600, z: 15950 } as const;

export const DRAGONSPINE_PLATEAUS: readonly PlateauDef[] = [
  WYRMWATCH_LODGE_PLATEAU,
  RIME_PASS_SHELTER_PLATEAU,
  LAST_ANVIL_PLATEAU,
  HAWK_CLIFFS_FOOT_PLATEAU,
  COLLAPSED_CAVE_PLATEAU,
  M28_CRAG_PLATEAU,
  SUMMIT_GATE_PLATEAU,
  WYRMS_HEARTH_PLATEAU,
  SKYHOLD_TOP_PLATEAU,
  FROSTFANG_AERIE_PLATEAU,
  FROSTFANG_KEEP_PLATEAU,
];

const centre = (p: PlateauDef) => ({ x: (p.box.minX + p.box.maxX) / 2, z: (p.box.minZ + p.box.maxZ) / 2, height: p.height });

/** Every Dragonspine plateau's centre and surface height (engine metres). */
export const DRAGONSPINE_SITES = {
  wyrmwatchLodge: centre(WYRMWATCH_LODGE_PLATEAU),
  rimePassShelter: centre(RIME_PASS_SHELTER_PLATEAU),
  lastAnvil: centre(LAST_ANVIL_PLATEAU),
  hawkCliffsFoot: centre(HAWK_CLIFFS_FOOT_PLATEAU),
  collapsedCave: centre(COLLAPSED_CAVE_PLATEAU),
  m28Crag: centre(M28_CRAG_PLATEAU),
  summitGate: centre(SUMMIT_GATE_PLATEAU),
  wyrmsHearth: centre(WYRMS_HEARTH_PLATEAU),
  skyholdTop: centre(SKYHOLD_TOP_PLATEAU),
  frostfangAerie: centre(FROSTFANG_AERIE_PLATEAU),
  frostfangKeep: centre(FROSTFANG_KEEP_PLATEAU),
} as const;

// ---- roads (in world-shape order: each is fitted on the ground with the roads before it laid)

/** The Spine Road's east part: from the Greyfen's east edge, 1.5 km north of the Waste, to the lodge's west edge. */
export const SPINE_ROAD_EAST_POINTS: RoadPolyline = [
  [6500, 12800],
  [8200, 12700],
  [10000, 12500],
  [11500, 12250],
  [12700, 12000],
  [13530, 11900],
];
export const SPINE_ROAD_EAST = road('spine-road', SPINE_ROAD_EAST_POINTS, 5, 25, 0.08);

/** From Deepgate's north edge up the low ground east of the ridges, west over the saddle and the seam to the lodge. */
export const DEEPGATE_TRACK_POINTS: RoadPolyline = [
  [20660, 8250],
  [20660, 8550],
  [20500, 9300],
  [20250, 10300],
  [19900, 11000],
  [19300, 11300],
  [18600, 11250],
  [18250, 11130],
  [17850, 11220],
  [17000, 11250],
  [16300, 11130],
  [15400, 11250],
  [14600, 11550],
  [13670, 11900],
];
export const DEEPGATE_TRACK = road('deepgate-track', DEEPGATE_TRACK_POINTS, 4, 20, 0.1, { maxBlend: 150 });

/** The lodge's north edge, the shelter, the Last Anvil's west edge, the summit gate and the Wyrm's Hearth's south edge. */
export const RIME_PASS_POINTS: RoadPolyline = [
  [13600, 11955],
  [13300, 12600],
  [13035, 13300],
  [13600, 13350],
  [14200, 13650],
  [14640, 13900],
  [14250, 14250],
  [14800, 14550],
  [13600, 14750],
  [13600, 15475],
];
export const RIME_PASS = road('rime-pass', RIME_PASS_POINTS, 4, 20, 0.12, { maxBlend: 60, maxSideSlope: 1.1 });

/** From the summit gate pad's west edge along the Skyhold mesa to the cliff top. */
export const SKYHOLD_SPUR_POINTS: RoadPolyline = [
  [13570, 14750],
  [13300, 14900],
  [13000, 14870],
  [12700, 15100],
  [12450, 15080],
  [12280, 15200],
];
export const SKYHOLD_SPUR = road('skyhold-spur', SKYHOLD_SPUR_POINTS, 3.5, 20, 0.1, { maxBlend: 60, maxSideSlope: 1.1 });

/** In world-shape order (each road is fitted on the roads before it). */
export const DRAGONSPINE_ROADS: readonly RoadDef[] = [SPINE_ROAD_EAST, DEEPGATE_TRACK, RIME_PASS, SKYHOLD_SPUR];
