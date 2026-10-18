// The Dead Road's drawn course. Phase A's part (west of the fog wall) is DRAWN ONLY: it is never fed to the terrain
// shaping, because the shaped box x -1500..1090 is protected. From (1100, -150) the shaped `RoadDef`
// (src/terrain/shape/deadRoad.ts, thread 4's data in core's file) takes over and the ribbon follows its polyline.
import { DEAD_ROAD } from '../terrain/shape/deadRoad';
import type { Pt } from './ribbon';

export const ROAD_WIDTH = 6;
export const ROAD_Z = -150;
export const ROAD_WEST_X = -480;
/** Where the slice fog wall stands; the drawn road ends here in phase A. */
export const ROAD_EAST_X = 1100;

/** West end, the lane junction at (0, -150), then due east to the fog wall. */
export const DEAD_ROAD_DRAWN: readonly Pt[] = [
  [ROAD_WEST_X, ROAD_Z],
  [-420, ROAD_Z],
  [0, ROAD_Z],
  [500, ROAD_Z],
  [ROAD_EAST_X, ROAD_Z],
];

/** The whole road as drawn: Phase A's course, then the shaped road's points after its first (which is the fog wall's (1100, -150)). */
export const DEAD_ROAD_FULL: readonly Pt[] = [...DEAD_ROAD_DRAWN, ...DEAD_ROAD.points.slice(1).map((p): Pt => [p.x, p.z])];

/** The lane from the loft meets the road at (0, -150): drawn as a 4 m dirt track from the loft's gate area. */
export const LANE_TRACK_DRAWN: readonly Pt[] = [
  [0, ROAD_Z],
  [0, -60],
  [0, 20],
];
export const LANE_WIDTH = 4;
