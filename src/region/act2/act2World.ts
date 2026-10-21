// Act 2 world data (thread A1, contracts v0.6 item 4): the road corridors that join Harrowmark, Cinderreach and Oldsmoke
// to the open area, the fog wall faces where roads cross closed edges, their toast strings and the road strips grass
// keeps off. Plain data: the act2-world plugin registers it. Every condition is a region's own `openWhen`, so the Phase C
// hold (`PHASE_HOLDS`) and A16's retirement of it apply to the corridors and walls with no edit here.
import type { FlagCondition } from '../../core/flagCondition';
import { CINDERREACH_ROADS, CINDER_ROAD_POINTS, type RoadPolyline } from '../../terrain/shape/cinderRoad';
import { OLDSMOKE_PASS_POINTS, OLDSMOKE_ROADS } from '../../terrain/shape/oldsmokePass';
import { roadPoint } from '../../terrain/shape/roadPoint';
import type { CorridorDef } from '../containment';
import type { FogWallDef } from '../fogWall';
import { REGION_INFO } from '../regions';

/** Never open: the faces toward the regions of later acts (the same never-set key the registry uses). */
const NEVER: FlagCondition = { any: ['region.never'] };

/** Arc (m) of the Cinder Road's M11 station, A3's blighted waystone: the road 5 km out of Harrowmark. */
export const M11_STATION_ARC = 5000;
/** Half the length of the wider corridor around the M11 station, and its half width (A3's wraith fight). */
export const M11_CORRIDOR_HALF_LENGTH = 100;
export const M11_CORRIDOR_HALF_WIDTH = 60;

const pt = (p: { x: number; z: number }) => [p.x, p.z] as const;

/** The polyline's points up to and including the first one at or past `x` (the join into the next region). */
function untilX(points: RoadPolyline, x: number): RoadPolyline {
  const i = points.findIndex(([px]) => px >= x);
  return i < 0 ? points : points.slice(0, i + 1);
}

/** The polyline's points from the last one before `z` (counting from its start). */
function fromZ(points: RoadPolyline, z: number): RoadPolyline {
  const i = points.findIndex(([, pz]) => pz >= z);
  return i <= 0 ? points : points.slice(i - 1);
}

/**
 * The Cinder Road from the River Gate to the first point inside Cinderreach, (15600, 3300): 100 m past the box's west
 * edge, and it starts 1.3 km inside Harrowmark's box, so both joins overlap by more than 50 m.
 */
export const CINDER_ROAD_CORRIDOR: CorridorDef = {
  id: 'corridor.cinder-road',
  points: untilX(CINDER_ROAD_POINTS, 15550),
  openWhen: REGION_INFO.cinderreach.openWhen,
};

/** 60 m wide for 100 m either side of the M11 station (the default corridor is 40 m). */
export const M11_CORRIDOR: CorridorDef = {
  id: 'corridor.cinder-road.m11',
  points: [pt(roadPoint('cinder-road', M11_STATION_ARC - M11_CORRIDOR_HALF_LENGTH)), pt(roadPoint('cinder-road', M11_STATION_ARC)), pt(roadPoint('cinder-road', M11_STATION_ARC + M11_CORRIDOR_HALF_LENGTH))],
  halfWidth: M11_CORRIDOR_HALF_WIDTH,
  openWhen: REGION_INFO.cinderreach.openWhen,
};

/** The pass from (21500, 5000), 500 m inside Cinderreach, to Deepgate's edge, 750 m inside Oldsmoke. */
export const OLDSMOKE_PASS_CORRIDOR: CorridorDef = {
  id: 'corridor.oldsmoke-pass',
  points: fromZ(OLDSMOKE_PASS_POINTS, 5450),
  openWhen: REGION_INFO.oldsmoke.openWhen,
};

export const ACT2_CORRIDORS: readonly CorridorDef[] = [CINDER_ROAD_CORRIDOR, M11_CORRIDOR, OLDSMOKE_PASS_CORRIDOR];

/** Act 2 walls are hidden (and their ash still) beyond this distance; the fog hides them well before. */
export const WALL_CULL = 3500;

export const FOG_TOAST_CINDER_ROAD = 'region.fog.cinderRoad.toast';
export const FOG_TOAST_OLDSMOKE_PASS = 'region.fog.oldsmokePass.toast';
export const FOG_TOAST_SHUT = 'region.fog.shut.toast';

/** Invented text (logged in design/changes-applied.md): the design gives the walls (5.9), not their words. */
export const ACT2_WORLD_STRINGS_EN: Record<string, string> = {
  [FOG_TOAST_CINDER_ROAD]: 'The ash-fall over the Cinder Road is too thick to cross. It will not lift while Harrowmark still needs you.',
  [FOG_TOAST_OLDSMOKE_PASS]: "Ash pours down the pass from Oldsmoke. Scorchhold's hunters hold this road, and nobody passes while the fort stands.",
  [FOG_TOAST_SHUT]: 'The ash-fall here is a wall. Whatever lies beyond will have to wait.',
};

/**
 * The Act 2 faces. Each stands on its own `cinderroad.fog.*` anchor (act2World.layout.ts), 30 m or more inside the
 * open area of the first state in which it stands, with its blocked side outward.
 */
export const ACT2_FOG_WALLS: readonly FogWallDef[] = [
  // Across the Cinder Road where it leaves Harrowmark's box (x 10500): the River Gate's shutter holds the gate itself.
  { id: 'fog.cinder-road', anchorId: 'cinderroad.fog.cinder-road', axis: 'x', halfLength: 150, blockedSide: 1, openWhen: REGION_INFO.cinderreach.openWhen, toastKey: FOG_TOAST_CINDER_ROAD, pushBackTo: 1, cullBeyond: WALL_CULL },
  // Across the pass road at Cinderreach's north edge (z 5500): Oldsmoke's own condition, with the Phase C hold.
  { id: 'fog.oldsmoke-pass', anchorId: 'cinderroad.fog.oldsmoke-pass', axis: 'z', halfLength: 150, blockedSide: 1, openWhen: REGION_INFO.oldsmoke.openWhen, toastKey: FOG_TOAST_OLDSMOKE_PASS, pushBackTo: 1, cullBeyond: WALL_CULL },
  // Shut faces where later acts' roads will cross.
  { id: 'fog.greyfen', anchorId: 'cinderroad.fog.greyfen', axis: 'z', halfLength: 150, blockedSide: 1, openWhen: NEVER, toastKey: FOG_TOAST_SHUT, pushBackTo: 1, cullBeyond: WALL_CULL },
  { id: 'fog.ashen-waste', anchorId: 'cinderroad.fog.ashen-waste', axis: 'z', halfLength: 150, blockedSide: 1, openWhen: NEVER, toastKey: FOG_TOAST_SHUT, pushBackTo: 1, cullBeyond: WALL_CULL },
  { id: 'fog.dragonspine', anchorId: 'cinderroad.fog.dragonspine', axis: 'x', halfLength: 500, blockedSide: -1, openWhen: NEVER, toastKey: FOG_TOAST_SHUT, pushBackTo: 1, cullBeyond: WALL_CULL },
  { id: 'fog.caldera', anchorId: 'cinderroad.fog.caldera', axis: 'x', halfLength: 150, blockedSide: -1, openWhen: NEVER, toastKey: FOG_TOAST_SHUT, pushBackTo: 1, cullBeyond: WALL_CULL },
];

/** Every Act 2 road's polyline with its half width: drawn as ribbons, and kept free of grass. */
export const ACT2_ROAD_STRIPS: readonly { id: string; points: RoadPolyline; halfWidth: number }[] = [...CINDERREACH_ROADS, ...OLDSMOKE_ROADS].map((r) => ({
  id: r.id,
  points: r.points.map((p) => [p.x, p.z] as const),
  halfWidth: r.halfWidth,
}));
