// Act 3 master positions (thread K1, plans/act3-K1.md "Master positions"): every Act 3 place, waystone, interior pad,
// the ferry and the M24 pool, fitted to the shaped heightfield. Siblings (K2, K3, K4, K7, K9) import these and never
// hard-code a site. `y` is the ground (a plateau's surface) at the point. Plain data, worker-safe.
import type { RoadPolyline } from '../../terrain/shape/cinderRoad';
import { FERRY_MERE_GREYWATCH_POINTS, FERRY_MERE_MIREWEATHER_POINTS, FERRY_REEDGATE_MERE_POINTS, GREYFEN_WATER_TABLE } from '../../terrain/shape/greyfen';

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
const d = (x: number, z: number, y: number): Act3Place => ({ x, z, y, region: 'dragonspine' });

// PLACEHOLDER heights until the fit lands (plans/act3-K1.md); the x and z are the plan's Part 3.5 positions.
export const ACT3_PLACES: Readonly<Record<Act3PlaceId, Act3Place>> = {
  reedgate: g(3200, 10200, 7),
  'reedgate-ferry': g(3600, 10100, 7),
  'hathrens-mere': g(3000, 12500, 6),
  'mere-shrine': g(3000, 12050, 7),
  'mireweather-hut': g(5600, 12300, 8),
  'greywatch-post-1': g(1200, 13900, 8),
  'greywatch-post-2': g(2300, 14300, 8),
  'greywatch-post-3': g(3500, 14500, 8),
  'greywatch-post-4': g(4400, 14100, 8),
  'sunken-chapel': g(2600, 14700, 7),
  'mirewater-deeps': g(2300, 12000, 7),
  'wyrmwatch-lodge': d(13600, 11900, 120),
  'hawk-cliffs': d(11400, 13000, 150),
  'rime-pass-shelter': d(13000, 13300, 250),
  'collapsed-cave': d(12300, 13700, 280),
  'last-anvil': d(14700, 13900, 380),
  'wyrms-hearth': d(13600, 15600, 600),
  'skyhold-cliffs': d(12200, 15200, 575),
  'frostfang-aerie': d(15600, 16100, 540),
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

/** Nine waystones (plan 3.5): four in the Greyfen, five in the Dragonspine. */
export const ACT3_WAYSTONES: Readonly<Record<Act3WaystoneId, Act3Point>> = {
  reedgate: { x: 3200, z: 10200, y: 7 },
  'hathrens-mere': { x: 3000, z: 12050, y: 7 },
  greywatch: { x: 2700, z: 14450, y: 7 },
  'mireweather-hut': { x: 5572, z: 12282, y: 8 },
  'wyrmwatch-lodge': { x: 13600, z: 11850, y: 120 },
  'rime-pass': { x: 13000, z: 13300, y: 250 },
  'last-anvil': { x: 14700, z: 13900, y: 380 },
  'wyrms-hearth': { x: 13600, z: 15600, y: 600 },
  'frostfang-aerie': { x: 15600, z: 15950, y: 540 },
};

export type Act3InteriorPadId = 'sunken-chapel' | 'mirewater-deeps' | 'mireweather-hut' | 'frostfang-keep' | 'wyrmwatch-hall';

/** An exactly flat pad under an interior's footprint: centre, width along x, depth along z, surface height. */
export interface Act3InteriorPad extends Act3Point {
  w: number;
  d: number;
}

export const ACT3_INTERIOR_PADS: Readonly<Record<Act3InteriorPadId, Act3InteriorPad>> = {
  'sunken-chapel': { x: 2600, z: 14700, y: 7, w: 68, d: 78 },
  'mirewater-deeps': { x: 2300, z: 12000, y: 7, w: 98, d: 118 },
  'mireweather-hut': { x: 5600, z: 12300, y: 8, w: 20, d: 17 },
  'frostfang-keep': { x: 15600, z: 16100, y: 540, w: 40, d: 50 },
  'wyrmwatch-hall': { x: 13600, z: 11900, y: 120, w: 30, d: 20 },
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
    { id: 'reedgate', x: 3600, z: 10100 },
    { id: 'mere', x: 3150, z: 11900 },
    { id: 'greywatch', x: 2800, z: 14250 },
    { id: 'mireweather', x: 5500, z: 12350 },
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
export const WYRMWATCH_HEARTH: Act3Point = { x: 13620, z: 11880, y: 120 };
