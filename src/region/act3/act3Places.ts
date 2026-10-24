// Act 3 master positions (thread K1, plans/act3-K1.md "Master positions"): every Act 3 place, waystone, interior pad,
// the ferry and the M24 pool, fitted to the shaped heightfield. Siblings (K2, K3, K4, K7, K9) import these and never
// hard-code a site. `y` is the ground (a plateau's surface) at the point. Plain data, worker-safe.
import type { RoadPolyline } from '../../terrain/shape/cinderRoad';
import { COLLAPSED_CAVE_FLOAT_PLATEAU, DRAGONSPINE_SITES as DS, WYRMWATCH_HALL_PAD, WYRMWATCH_LODGE_PLATEAU } from '../../terrain/shape/dragonspine';
import {
  FERRY_MERE_GREYWATCH_POINTS,
  FERRY_MERE_MIREWEATHER_POINTS,
  FERRY_REEDGATE_MERE_POINTS,
  FERRY_STOP_POINTS,
  GREYFEN_WATER_TABLE,
  GREYWATCH_PLATEAU,
  HATHRENS_MERE,
  MERE_SHRINE_PLATEAU,
  MIREWATER_DEEPS_PLATEAU,
  MIREWEATHER_HUT_PLATEAU,
  REEDGATE_FERRY_PLATEAU,
  REEDGATE_PLATEAU,
  SUNKEN_CHAPEL_PLATEAU,
} from '../../terrain/shape/greyfen';
import type { PlateauDef } from '../../terrain/shaping';

export interface Act3Point {
  x: number;
  z: number;
  /** Ground height at the point (engine metres). */
  y: number;
}

export type Act3PlaceId =
  | 'reedgate'
  | 'reedgate-ferry'
  | 'hathrens-mere'
  | 'mere-shrine'
  | 'mireweather-hut'
  | 'greywatch-post-1'
  | 'greywatch-post-2'
  | 'greywatch-post-3'
  | 'greywatch-post-4'
  | 'sunken-chapel'
  | 'mirewater-deeps'
  | 'wyrmwatch-lodge'
  | 'hawk-cliffs'
  | 'rime-pass-shelter'
  | 'collapsed-cave'
  | 'last-anvil'
  | 'wyrms-hearth'
  | 'skyhold-cliffs'
  | 'frostfang-aerie';

export interface Act3Place extends Act3Point {
  region: 'greyfen' | 'dragonspine';
}

const g = (x: number, z: number, y: number): Act3Place => ({ x, z, y, region: 'greyfen' });
const d = (site: { x: number; z: number; height: number }): Act3Place => ({ x: site.x, z: site.z, y: site.height, region: 'dragonspine' });
const mid = (p: PlateauDef): Act3Point => ({ x: (p.box.minX + p.box.maxX) / 2, z: (p.box.minZ + p.box.maxZ) / 2, y: p.height });
const gp = (p: PlateauDef): Act3Place => ({ ...mid(p), region: 'greyfen' });

/**
 * Every Act 3 place (plan 3.5) at its fitted plateau. The Greywatch posts are stilt posts: y is the bog ground under
 * them (post 4 stands in a wading pool, under the 6 m water sheet); the Mere's y is its surface. Dragonspine places
 * are the plateau centres in DRAGONSPINE_SITES.
 */
export const ACT3_PLACES: Readonly<Record<Act3PlaceId, Act3Place>> = {
  reedgate: gp(REEDGATE_PLATEAU),
  'reedgate-ferry': g(3600, 10100, REEDGATE_FERRY_PLATEAU.height),
  'hathrens-mere': g(HATHRENS_MERE.x, HATHRENS_MERE.z, GREYFEN_WATER_TABLE),
  'mere-shrine': gp(MERE_SHRINE_PLATEAU),
  'mireweather-hut': gp(MIREWEATHER_HUT_PLATEAU),
  'greywatch-post-1': g(1200, 13900, 10.5),
  'greywatch-post-2': g(2300, 14300, 7.9),
  'greywatch-post-3': g(3500, 14500, 7.2),
  'greywatch-post-4': g(4400, 14100, 5.2),
  'sunken-chapel': gp(SUNKEN_CHAPEL_PLATEAU),
  'mirewater-deeps': gp(MIREWATER_DEEPS_PLATEAU),
  'wyrmwatch-lodge': d(DS.wyrmwatchLodge),
  'hawk-cliffs': d(DS.hawkCliffsFoot),
  'rime-pass-shelter': d(DS.rimePassShelter),
  'collapsed-cave': d(DS.collapsedCave),
  'last-anvil': d(DS.lastAnvil),
  'wyrms-hearth': d(DS.wyrmsHearth),
  'skyhold-cliffs': d(DS.skyholdTop),
  'frostfang-aerie': d(DS.frostfangAerie),
};

export type Act3WaystoneId =
  | 'reedgate'
  | 'hathrens-mere'
  | 'greywatch'
  | 'mireweather-hut'
  | 'wyrmwatch-lodge'
  | 'rime-pass'
  | 'last-anvil'
  | 'wyrms-hearth'
  | 'frostfang-aerie';

/** Nine waystones (plan 3.5): four in the Greyfen, five in the Dragonspine, each on its plateau. */
export const ACT3_WAYSTONES: Readonly<Record<Act3WaystoneId, Act3Point>> = {
  reedgate: { x: 3200, z: 10200, y: REEDGATE_PLATEAU.height },
  'hathrens-mere': { x: 2986, z: 12050, y: MERE_SHRINE_PLATEAU.height },
  greywatch: { x: 2700, z: 14460, y: GREYWATCH_PLATEAU.height },
  'mireweather-hut': { x: 5572, z: 12282, y: MIREWEATHER_HUT_PLATEAU.height },
  'wyrmwatch-lodge': { x: 13600, z: 11870, y: DS.wyrmwatchLodge.height },
  'rime-pass': { x: 12985, z: 13300, y: DS.rimePassShelter.height },
  'last-anvil': { x: 14720, z: 13900, y: DS.lastAnvil.height },
  'wyrms-hearth': { x: 13600, z: 15600, y: DS.wyrmsHearth.height },
  'frostfang-aerie': { x: 15600, z: 15950, y: DS.frostfangAerie.height },
};

export type Act3InteriorPadId = 'sunken-chapel' | 'mirewater-deeps' | 'mireweather-hut' | 'frostfang-keep' | 'wyrmwatch-hall' | 'collapsed-cave';

/** An exactly flat pad under an interior's footprint: centre, width along x, depth along z, surface height. */
export interface Act3InteriorPad extends Act3Point {
  w: number;
  d: number;
}

const padOf = (p: PlateauDef): Act3InteriorPad => ({ ...mid(p), w: p.box.maxX - p.box.minX, d: p.box.maxZ - p.box.minZ });

/** The interior pads (K3, K4): flat under the shaped heightfield, so the 40 m float rule holds. */
export const ACT3_INTERIOR_PADS: Readonly<Record<Act3InteriorPadId, Act3InteriorPad>> = {
  'sunken-chapel': padOf(SUNKEN_CHAPEL_PLATEAU),
  'mirewater-deeps': padOf(MIREWATER_DEEPS_PLATEAU),
  'mireweather-hut': { x: 5600, z: 12300, y: MIREWEATHER_HUT_PLATEAU.height, w: 20, d: 17 },
  'collapsed-cave': padOf(COLLAPSED_CAVE_FLOAT_PLATEAU),
  'frostfang-keep': { x: DS.frostfangKeep.x, z: DS.frostfangKeep.z, y: DS.frostfangKeep.height, w: 40, d: 50 },
  'wyrmwatch-hall': {
    x: (WYRMWATCH_HALL_PAD.minX + WYRMWATCH_HALL_PAD.maxX) / 2,
    z: (WYRMWATCH_HALL_PAD.minZ + WYRMWATCH_HALL_PAD.maxZ) / 2,
    y: WYRMWATCH_LODGE_PLATEAU.height,
    w: WYRMWATCH_HALL_PAD.maxX - WYRMWATCH_HALL_PAD.minX,
    d: WYRMWATCH_HALL_PAD.maxZ - WYRMWATCH_HALL_PAD.minZ,
  },
};

/** M24's dive pool (K7): a 12 x 10 m pit, 6 m deep, with a flat rim, 30 m east of the Reedgate Ferry landing. */
export const M24_POOL = { x: 3630, z: 10100, w: 12, d: 10, rimY: 7, floorY: 1 } as const;

export type Act3FerryStopId = 'reedgate' | 'mere' | 'greywatch' | 'mireweather';

export interface Act3FerryPath {
  id: string;
  from: Act3FerryStopId;
  to: Act3FerryStopId;
  /** The boat's path, landing to landing (water at least 1.3 m deep along it). */
  points: RoadPolyline;
}

/** From the Mere's south jetty out into its deep water, where the other two paths leave. */
const MERE_OUT: RoadPolyline = FERRY_REEDGATE_MERE_POINTS.slice(3);

/** The fen ferry (K7 builds the ride): stops agreed with K7, the channels K1 carves, one surface for all fen water. */
export const ACT3_FERRY: {
  surfaceY: number;
  stops: readonly { id: Act3FerryStopId; x: number; z: number }[];
  paths: readonly Act3FerryPath[];
} = {
  surfaceY: GREYFEN_WATER_TABLE,
  stops: [
    { id: 'reedgate', ...FERRY_STOP_POINTS.reedgate },
    { id: 'mere', ...FERRY_STOP_POINTS.mere },
    { id: 'greywatch', ...FERRY_STOP_POINTS.greywatch },
    { id: 'mireweather', ...FERRY_STOP_POINTS.mireweather },
  ],
  paths: [
    { id: 'ferry.reedgate-mere', from: 'reedgate', to: 'mere', points: FERRY_REEDGATE_MERE_POINTS.slice(0, 4) },
    { id: 'ferry.mere-greywatch', from: 'mere', to: 'greywatch', points: [...MERE_OUT, ...FERRY_MERE_GREYWATCH_POINTS] },
    { id: 'ferry.mere-mireweather', from: 'mere', to: 'mireweather', points: [...MERE_OUT, ...FERRY_MERE_MIREWEATHER_POINTS] },
  ],
};

/**
 * The camp hearth in Wyrmwatch Lodge's yard (K0's `campAnchorId`, `dragonspine.wyrmwatch.hearth`): K1 defines the anchor
 * from this point, K4 builds the fire pit around it, the act-ending director moves the party here (contracts v0.7 item 18).
 */
export const WYRMWATCH_HEARTH: Act3Point = { x: 13620, z: 11880, y: WYRMWATCH_LODGE_PLATEAU.height };
