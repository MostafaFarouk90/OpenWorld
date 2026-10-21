// Act 2 thread A1 owns this data (contracts/heightfield.md "Terrain shaping"): the Cinder Road from Harrowmark's River
// Gate to Cinderford, its four branches and the Cinderreach plateaus. Types only, so the terrain workers can load it.
// Fitted on the real `heightAt` (plans/act2-A1.md "Master positions"); siblings import these constants, never copies.
import type { PlateauDef, RidgeSuppressionDef, RoadDef, ShapeBox } from '../shaping';

export type RoadPolyline = readonly (readonly [number, number])[];

const road = (id: string, points: RoadPolyline, halfWidth: number, blend: number, maxGrade: number, startTaper = 0): RoadDef => ({
  id,
  points: points.map(([x, z]) => ({ x, z })),
  halfWidth,
  blend,
  maxGrade,
  startTaper,
  maxSideSlope: 0.6,
});

/** Cinderreach's ridges lowered by 40%: "rolling volcanic foothills" (design 5.3), and every site's slope check passes. */
export const CINDERREACH_FOOTHILLS: RidgeSuppressionDef = {
  id: 'cinderreach-foothills',
  box: { minX: 15500, maxX: 22500, minZ: -500, maxZ: 5500 },
  blend: 600,
  strength: 0.4,
};

export const CINDERFORD_PLATEAU: PlateauDef = { id: 'cinderford', box: { minX: 20700, maxX: 21400, minZ: 2100, maxZ: 2700 }, height: 21, blend: 200 };
export const STONEFOLD_PLATEAU: PlateauDef = { id: 'stonefold', box: { minX: 16650, maxX: 17050, minZ: 4000, maxZ: 4400 }, height: 9, blend: 150 };
/** The 60 x 60 m shelf on the slope above Stonefold (R07's hound den, R11's wyrm den; A3). */
export const STONEFOLD_DEN_SHELF: PlateauDef = { id: 'stonefold-den', box: { minX: 16120, maxX: 16180, minZ: 4220, maxZ: 4280 }, height: 104, blend: 120 };
/** On the north ridge's south shoulder; A3's fort is 220 x 160 m. */
export const SCORCHHOLD_PLATEAU: PlateauDef = { id: 'scorchhold', box: { minX: 19820, maxX: 20080, minZ: 4800, maxZ: 5000 }, height: 125, blend: 300 };
/** The shrine's spur at the end of the ridge path (A9 builds the shrine). */
export const HUSHED_ANVIL_PLATEAU: PlateauDef = { id: 'hushed-anvil', box: { minX: 19840, maxX: 19960, minZ: 2640, maxZ: 2760 }, height: 129, blend: 300 };

/** Fellwalker Pasture: open rolling ground (R05's fog hollows), no plateau. */
export interface PlaceArea {
  centre: { x: number; z: number };
  box: ShapeBox;
}
export const FELLWALKER_PASTURE: PlaceArea = { centre: { x: 17200, z: 2900 }, box: { minX: 16950, maxX: 17450, minZ: 2650, maxZ: 3150 } };

export const CINDER_ROAD_POINTS: RoadPolyline = [
  [9245, 2170],
  [9500, 2200],
  [10000, 2250],
  [10500, 2600],
  [11200, 2250],
  [11800, 2350],
  [12600, 2900],
  [13300, 2700],
  [13800, 2150],
  [14500, 2450],
  [15000, 2900],
  [15600, 3300],
  [16500, 3550],
  [17500, 3650],
  [18000, 4050],
  [18500, 3800],
  [19500, 3550],
  [20300, 3600],
  [20800, 3300],
  [21000, 2950],
  [21035.7, 2700],
];
/** From just outside the River Gate (9231, 2167) to Cinderford, about 13.7 km. Listed before its branches. */
export const CINDER_ROAD = road('cinder-road', CINDER_ROAD_POINTS, 6, 30, 0.08, 60);

// Every road ends on its plateau's edge (the profile's end is pinned to the ground there, which is the plateau's height).
// Branches start exactly on the Cinder Road's centreline, with no taper: the shaper fits a road on the ground with the
// earlier roads laid, so a branch leaves the trunk at the trunk's surface.
export const STONEFOLD_ROAD_POINTS: RoadPolyline = [
  [16900, 3590],
  [16880, 3800],
  [16856, 4000],
];
export const STONEFOLD_ROAD = road('stonefold-road', STONEFOLD_ROAD_POINTS, 4, 20, 0.1, 36);

export const FELLWALKER_TRACK_POINTS: RoadPolyline = [
  [17300, 3630],
  [17069, 3088],
  [17200, 2950],
];
export const FELLWALKER_TRACK = road('fellwalker-track', FELLWALKER_TRACK_POINTS, 3, 15, 0.08, 36);

export const HUSHED_ANVIL_PATH_POINTS: RoadPolyline = [
  [19840, 3571.25],
  [19709, 3051],
  [19877, 2760],
];
/** A footpath (2.5 m half width, 12%); A3 puts the three Leap ledges beside it. */
export const HUSHED_ANVIL_PATH = road('hushed-anvil-path', HUSHED_ANVIL_PATH_POINTS, 2.5, 15, 0.12, 36);

export const SCORCHHOLD_ROAD_POINTS: RoadPolyline = [
  [19700, 3562.5],
  [19625, 4348],
  [20042, 4691],
  [19964.3, 4800],
];
export const SCORCHHOLD_ROAD = road('scorchhold-road', SCORCHHOLD_ROAD_POINTS, 4, 20, 0.1, 36);

export const CINDERREACH_PLATEAUS: readonly PlateauDef[] = [
  CINDERFORD_PLATEAU,
  STONEFOLD_PLATEAU,
  STONEFOLD_DEN_SHELF,
  SCORCHHOLD_PLATEAU,
  HUSHED_ANVIL_PLATEAU,
];
/** The trunk first, then its branches (order matters: each road is fitted on the roads before it). */
export const CINDERREACH_ROADS: readonly RoadDef[] = [CINDER_ROAD, STONEFOLD_ROAD, FELLWALKER_TRACK, HUSHED_ANVIL_PATH, SCORCHHOLD_ROAD];
