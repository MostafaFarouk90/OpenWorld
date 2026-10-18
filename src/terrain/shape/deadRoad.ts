// Thread 4 owns this data (contracts/heightfield.md "Terrain shaping"). It stays import-free apart from types, so
// the terrain workers can load it; thread 4's road mesh imports it and prepends the Phase A points west of the fog.
import type { PlateauDef, RoadDef } from '../shaping';

/** The Dead Road from the fog wall to Harrowmark's South Gate (placeholder polyline until thread 4's PR 2). */
export const DEAD_ROAD: RoadDef = {
  id: 'dead-road',
  points: [
    // Leaves the fog wall due east so nothing west of x 1100 is touched (the validator checks it).
    { x: 1100, z: -150 },
    { x: 1300, z: -150 },
    { x: 2600, z: 80 },
    { x: 4300, z: 380 },
    { x: 5900, z: 700 },
    { x: 7200, z: 1000 },
    { x: 8500, z: 1250 },
  ],
  halfWidth: 6,
  blend: 30,
  maxGrade: 0.08,
  startTaper: 60,
  maxSideSlope: 0.6,
};

/** Small plateaus outside the ring wall (the farm-ring); thread 4 adds them. */
export const DEAD_ROAD_PLATEAUS: readonly PlateauDef[] = [];
