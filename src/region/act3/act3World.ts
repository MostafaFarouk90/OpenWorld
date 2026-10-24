// Act 3 world data (thread K1, contracts v0.7 items 2, 3 and 19): the four new fog wall faces placed and given their
// lengths (K0 declared their ids, conditions and toasts in act3Fog.ts), the Act 3 road strips drawn and kept free of
// grass, and the camp anchor's position. Plain data: the act3-world plugin registers it.
import { DRAGONSPINE_ROADS } from '../../terrain/shape/dragonspine';
import { GREYFEN_ROADS } from '../../terrain/shape/greyfen';
import type { RoadPolyline } from '../../terrain/shape/cinderRoad';
import { act3FogFace } from '../act3Fog';
import type { FogWallDef } from '../fogWall';
import { WALL_CULL } from '../act2/act2World';
import { SUMMIT_BOX } from '../areas';

/** Where a polyline first crosses `x` (or `z`), interpolated; throws when it never does. */
export function crossing(points: RoadPolyline, axis: 'x' | 'z', at: number): { x: number; z: number } {
  const k = axis === 'x' ? 0 : 1;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1][k];
    const b = points[i][k];
    if ((a - at) * (b - at) <= 0 && a !== b) {
      const t = (at - a) / (b - a);
      return { x: points[i - 1][0] + (points[i][0] - points[i - 1][0]) * t, z: points[i - 1][1] + (points[i][1] - points[i - 1][1]) * t };
    }
  }
  throw new Error(`act3World: the polyline never crosses ${axis} = ${at}`);
}

const polylineOf = (id: string): RoadPolyline => {
  const r = [...GREYFEN_ROADS, ...DRAGONSPINE_ROADS].find((d) => d.id === id);
  if (!r) throw new Error(`act3World: unknown road "${id}"`);
  return r.points.map((p) => [p.x, p.z] as const);
};

/** Fog faces stand this far inside the open area of the state they stand in (Act 2's rule). */
export const FACE_INSET = 30;
/** The Greyfen's east edge (engine x 6500): the Spine Road's face stands 30 m inside it, on the road. */
export const SPINE_FACE_X = 6500 - FACE_INSET;
/** Just below the summit hole (z 14800), on the Rime Pass. */
export const SUMMIT_FACE_Z = SUMMIT_BOX.z0 - FACE_INSET;

export const FOG_FACE_POINTS = {
  'fog.spine-road': crossing(polylineOf('spine-road'), 'x', SPINE_FACE_X),
  'fog.summit': crossing(polylineOf('rime-pass'), 'z', SUMMIT_FACE_Z),
  /** Below Wyrmwatch Lodge, along the Dragonspine's south edge where the Ashen Waste lies (x 11500 to 15000, plan 3.4). */
  'fog.wyrmwatch-waste': { x: 13250, z: 11050 },
  /** At the Waste's corner where the Fen Road passes nearest (plan 3.4). */
  'fog.fen-waste': { x: 6990, z: 4700 },
} as const;

/** Anchor ids of the faces (act3World.layout.ts defines them). */
export const FOG_FACE_ANCHORS = {
  'fog.spine-road': 'spineroad.fog.spine-road',
  'fog.summit': 'dragonspine.fog.summit',
  'fog.wyrmwatch-waste': 'dragonspine.fog.wyrmwatch-waste',
  'fog.fen-waste': 'fenroad.fog.fen-waste',
} as const;

const face = (id: keyof typeof FOG_FACE_ANCHORS, axis: 'x' | 'z', halfLength: number, blockedSide: 1 | -1): FogWallDef => ({
  ...act3FogFace(id),
  anchorId: FOG_FACE_ANCHORS[id],
  axis,
  halfLength,
  blockedSide,
  pushBackTo: 1,
  cullBeyond: WALL_CULL,
});

/** The four new faces (plan 3.4). The two shipped faces keep their Act 2 placement with K0's conditions. */
export const ACT3_FOG_WALLS: readonly FogWallDef[] = [
  face('fog.spine-road', 'x', 150, 1),
  face('fog.summit', 'z', 150, 1),
  face('fog.wyrmwatch-waste', 'z', 1750, -1),
  face('fog.fen-waste', 'x', 200, 1),
];

export type Act3RoadSurface = 'earth' | 'stone';

/** Every Act 3 road drawn as a ribbon (the causeways carry K3's plank decks instead), kept free of grass. */
export const ACT3_ROAD_STRIPS: readonly { id: string; points: RoadPolyline; halfWidth: number; surface: Act3RoadSurface }[] = [...GREYFEN_ROADS, ...DRAGONSPINE_ROADS]
  .filter((r) => !r.id.startsWith('causeway-'))
  .map((r) => ({
    id: r.id,
    points: r.points.map((p) => [p.x, p.z] as const),
    halfWidth: r.halfWidth,
    surface: r.id === 'fen-road' || r.id === 'fen-track' || r.id === 'spine-road' ? 'earth' : 'stone',
  }));

/** The causeways, for grass keep-off only (K3 draws their decks). */
export const ACT3_CAUSEWAY_STRIPS: readonly { id: string; points: RoadPolyline; halfWidth: number }[] = GREYFEN_ROADS.filter((r) => r.id.startsWith('causeway-')).map((r) => ({
  id: r.id,
  points: r.points.map((p) => [p.x, p.z] as const),
  halfWidth: r.halfWidth,
}));
