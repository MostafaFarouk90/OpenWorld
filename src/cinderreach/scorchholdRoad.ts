// Where A1's Scorchhold road ends (its last polyline point, on the plateau's south edge): the fort's gate stands here.
import { SCORCHHOLD_ROAD_POINTS } from '../terrain/shape/cinderRoad';

const last = SCORCHHOLD_ROAD_POINTS[SCORCHHOLD_ROAD_POINTS.length - 1];
export const ROAD_END_SCORCHHOLD = { x: last[0], z: last[1] };
