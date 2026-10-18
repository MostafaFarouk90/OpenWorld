// The Dead Road's drawn course in phase A. DRAWN ONLY: this array is never fed to the terrain shaping (thread 11's
// `RoadDef` in src/terrain/shape/deadRoad.ts starts at (1100, -150) in the phase B PR; the shaped box x -1500..1090 is protected).
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

/** The lane from the loft meets the road at (0, -150): drawn as a 4 m dirt track from the loft's gate area. */
export const LANE_TRACK_DRAWN: readonly Pt[] = [
  [0, ROAD_Z],
  [0, -60],
  [0, 20],
];
export const LANE_WIDTH = 4;
