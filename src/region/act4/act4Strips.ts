// Act 4 thread L1: every Act 4 road and track drawn as a ribbon (the Ash Road, the Underways exit track, the wall
// track and the six rope-lines' lanes), kept free of grass by the region plugin. Plain data, worker-safe.
import { WASTE_ROADS } from '../../terrain/shape/waste';
import { WALL_TRACK_HALF_WIDTH, WALL_TRACK_ID, WALL_TRACK_POINTS } from './wallTrack';

export type Act4RoadSurface = 'earth' | 'ash';

export interface Act4Strip {
  id: string;
  points: readonly (readonly [number, number])[];
  halfWidth: number;
  surface: Act4RoadSurface;
}

export const ACT4_ROAD_STRIPS: readonly Act4Strip[] = [
  ...WASTE_ROADS.map((r) => ({
    id: r.id,
    points: r.points.map((p) => [p.x, p.z] as const),
    halfWidth: r.halfWidth,
    // Packed earth on the road and the exit track; the rope-lanes are trodden ash.
    surface: (r.id.startsWith('rope-') ? 'ash' : 'earth') as Act4RoadSurface,
  })),
  { id: WALL_TRACK_ID, points: WALL_TRACK_POINTS, halfWidth: WALL_TRACK_HALF_WIDTH, surface: 'earth' },
];
