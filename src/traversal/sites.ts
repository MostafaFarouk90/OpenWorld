// Where K7's water content sits: the M24 dive pool and the Greyfen ferry. K1 is the master of positions
// (plans/act3-K1.md): `M24_POOL` and `ACT3_FERRY` from `src/region/act3/act3Places.ts` (the stops are K1's
// `FERRY_STOP_POINTS`, on dry quays). Until K1's branch lands these are copies of K1's values (branch
// claude/project-thread-gh7upo at 1c2b80b), in K1's shapes; sites.test.ts fails if they drift. The paths below are
// K7's provisional lines, used only when K1's module is absent (fenWater.ts `ferryNetwork` prefers K1's channels).
// K3 places the fence and the anchors (`greyfen.m24.pool*`, `greyfen.ferry.<stop>`).
import type { Vec3Like } from '../core/events';
import type { FerryRouteDef } from '../movement/types';
import type { WaterVolumeDef } from '../water/types';
import type { DiveRouteStandsDef } from './dive/types';

/** K1's shape: the pit's centre, width along x, depth along z, the rim and floor heights. */
export interface PoolSite {
  readonly x: number;
  readonly z: number;
  readonly w: number;
  readonly d: number;
  readonly rimY: number;
  readonly floorY: number;
}

export interface FerryNetworkData {
  surfaceY: number;
  stops: readonly { id: string; x: number; z: number }[];
  paths: readonly { from: string; to: string; points: readonly { x: number; z: number }[] }[];
}

/** K1's M24 hollow: 12 x 10 m, 6 m deep, 30 m east of the Reedgate Ferry landing (3600, 10100). */
export const M24_POOL: PoolSite = { x: 3630, z: 10100, w: 12, d: 10, rimY: 7, floorY: 1 };

/** K1's ferry: four stops, the Greyfen water table at 6.0, channels about 2 m deep along these lines. */
export const ACT3_FERRY: FerryNetworkData = {
  surfaceY: 6.0,
  stops: [
    { id: 'reedgate', x: 3600, z: 10100 },
    { id: 'mere', x: 3168, z: 11907 },
    { id: 'greywatch', x: 2786, z: 14260 },
    { id: 'mireweather', x: 5516, z: 12344 },
  ],
  paths: [
    { from: 'reedgate', to: 'mere', points: [{ x: 3585, z: 10130 }, { x: 3450, z: 10900 }, { x: 3170, z: 11870 }] },
    { from: 'mere', to: 'greywatch', points: [{ x: 3140, z: 11930 }, { x: 2950, z: 13100 }, { x: 2815, z: 14220 }] },
    { from: 'mere', to: 'mireweather', points: [{ x: 3180, z: 11910 }, { x: 4300, z: 12150 }, { x: 5470, z: 12340 }] },
  ],
};

/** K3's anchors: the M24 pool and each ferry stop's landing (where the player boards and arrives). */
export const M24_ANCHORS = { pool: 'greyfen.m24.pool', entry: 'greyfen.m24.pool.entry', horn: 'greyfen.m24.pool.horn' } as const;
export const ferryStopAnchor = (stopId: string): string => `greyfen.ferry.${stopId}`;

/** Interactable id for a ferry stop (`kind:name`, no dots). */
export const ferryInteractId = (stopId: string): string => `ferry:${stopId}`;

/** The ferry's legs as K0's route type: one route per path, the boat on the water surface. */
export function ferryRoutes(data: FerryNetworkData, speed = 5): FerryRouteDef[] {
  return data.paths.map((p) => ({
    id: `ferry.greyfen.${p.from}-${p.to}`,
    stops: [
      { id: p.from, anchorId: ferryStopAnchor(p.from) },
      { id: p.to, anchorId: ferryStopAnchor(p.to) },
    ],
    path: p.points.map((q) => ({ x: q.x, y: data.surfaceY, z: q.z })),
    speed,
  }));
}

export const M24_VOLUME_ID = 'water.greyfen.m24-pool';
export const M24_ROUTE_ID = 'dive.greyfen.m24-pool';

/** The pool's dive volume: the hollow's box, the surface 0.3 m under the rim. */
export function m24Volume(pool: PoolSite = M24_POOL): WaterVolumeDef {
  const c = pool;
  const halfX = pool.w / 2;
  const halfZ = pool.d / 2;
  return {
    id: M24_VOLUME_ID,
    kind: 'dive',
    surfaceY: pool.rimY - 0.3,
    area: { box: { x0: c.x - halfX, z0: c.z - halfZ, x1: c.x + halfX, z1: c.z + halfZ } },
  };
}

/** The pool's route: in at the west rim, down to the horn on the floor, back up; the open pool refills at the surface. */
export function m24Route(pool: PoolSite = M24_POOL): DiveRouteStandsDef {
  const c = pool;
  const halfX = pool.w / 2;
  const surface = pool.rimY - 0.3;
  const entry: Vec3Like = { x: c.x - halfX + 0.8, y: surface - 1, z: c.z };
  const horn: Vec3Like = { x: c.x, y: pool.floorY + 0.3, z: c.z };
  return {
    id: M24_ROUTE_ID,
    volumeId: M24_VOLUME_ID,
    points: [entry, horn, entry],
    airPockets: [],
    entryStand: { x: c.x - halfX - 1, y: pool.rimY, z: c.z },
  };
}
