// Thread 4 owns this data and core owns the file's shape (contracts/heightfield.md "Terrain shaping"). It stays import-free apart from types, so
// the terrain workers can load it; thread 4's road mesh imports it and prepends the Phase A points west of the fog.
import type { PlateauDef, RoadDef } from '../shaping';

/** The Dead Road from the fog wall to Harrowmark's South Gate (fitted on the natural ground; `deadRoadFit.test.ts` holds the limits). */
export const DEAD_ROAD: RoadDef = {
  id: 'dead-road',
  points: [
    { x: 1100, z: -150 },
    { x: 1300, z: -150 },
    { x: 3200, z: 650 },
    { x: 4050, z: 650 },
    { x: 5250, z: 900 },
    { x: 6950, z: 750 },
    { x: 7700, z: 850 },
    { x: 8000, z: 1100 },
    { x: 8500, z: 1180 },
    { x: 8500, z: 1250 },
  ],
  halfWidth: 6,
  blend: 30,
  maxGrade: 0.08,
  startTaper: 60,
  maxSideSlope: 0.6,
};

/**
 * The farm-ring's flat site (x 6700..6950, z 680..880, all east of x 6500 so it is inside Harrowmark's region box).
 * The road crosses it, so its profile is the plateau height there; `deadRoadFit.test.ts` pins that.
 */
export const FARM_RING_PLATEAU: PlateauDef = {
  id: 'farm-ring',
  box: { minX: 6700, maxX: 6950, minZ: 680, maxZ: 880 },
  height: -5,
  blend: 150,
};

export const DEAD_ROAD_PLATEAUS: readonly PlateauDef[] = [FARM_RING_PLATEAU];
