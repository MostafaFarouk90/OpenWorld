// Where Cinderreach's places stand. Every position derives from A1's exported plateau boxes and road polylines
// (src/terrain/shape/cinderRoad.ts), never from copied coordinates; the sub-sites A1 gave no plateau (hunters' camp, hound
// den, fog hollows, the Kindling Dell) come from the committed flatness fit in sitesFit.ts. If A1 moves a plateau, run
// `npx vite-node tools/fit-cinderreach-sites.ts` and commit the new sitesFit.ts; sitesFit.test.ts fails until you do.
import {
  CINDERFORD_PLATEAU,
  CINDER_ROAD_POINTS,
  FELLWALKER_PASTURE,
  HUSHED_ANVIL_PATH_POINTS,
  HUSHED_ANVIL_PLATEAU,
  SCORCHHOLD_PLATEAU,
  STONEFOLD_DEN_SHELF,
  STONEFOLD_PLATEAU,
} from '../terrain/shape/cinderRoad';
import { M11_STATION_ARC } from '../region/act2/act2World';
import { roadLength, roadPoint } from '../terrain/shape/roadPoint';
import { fitLedge } from './ledgeFit';
import { SITES_FIT } from './sitesFit';

export interface Box {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}
export interface Site {
  box: Box;
  x: number;
  z: number;
}

const site = (box: Box): Site => ({ box, x: (box.minX + box.maxX) / 2, z: (box.minZ + box.maxZ) / 2 });

export const CINDERFORD = site(CINDERFORD_PLATEAU.box);
export const STONEFOLD = site(STONEFOLD_PLATEAU.box);
export const DEN_SHELF = site(STONEFOLD_DEN_SHELF.box);
export const SCORCHHOLD = site(SCORCHHOLD_PLATEAU.box);
export const HUSHED_ANVIL = site(HUSHED_ANVIL_PLATEAU.box);
export const PASTURE = { ...site(FELLWALKER_PASTURE.box), x: FELLWALKER_PASTURE.centre.x, z: FELLWALKER_PASTURE.centre.z };

/** The sheepfold stands just past the Fellwalker track's end (the track ends 50 m north of the pasture centre). */
export const PASTURE_FOLD = { x: PASTURE.x, z: PASTURE.z + 80 };

/** The Cinder Road's far end, on Cinderford's north edge (the barricade stands just inside it). */
export const ROAD_END = { x: CINDER_ROAD_POINTS[CINDER_ROAD_POINTS.length - 1][0], z: CINDER_ROAD_POINTS[CINDER_ROAD_POINTS.length - 1][1] };
export const ROAD_LENGTH = roadLength('cinder-road');
/** The blighted waystone stands beside A1's M11 station (arc 5000 m), 9 m off the road's left edge. */
export const M11_STONE = roadPoint('cinder-road', M11_STATION_ARC, 9);
export const ANVIL_PATH_START = { x: HUSHED_ANVIL_PATH_POINTS[0][0], z: HUSHED_ANVIL_PATH_POINTS[0][1] };

/** A point on the Cinder Road `fromEnd` m before its end, `side` m left of travel. */
export const roadFromEnd = (fromEnd: number, side = 0) => roadPoint('cinder-road', ROAD_LENGTH - fromEnd, side);

const anvilWant = (arc: number) => roadPoint('hushed-anvil-path', arc, 14);
/** The five Leap ledges, fitted to climbable ground near where the plan wants them (den shelf, beside the Anvil footpath). */
export const LEDGE_SPOTS = {
  'den-1': fitLedge(DEN_SHELF.x + 52, DEN_SHELF.z - 14),
  'den-2': fitLedge(DEN_SHELF.x + 52, DEN_SHELF.z + 16),
  'anvil-1': fitLedge(anvilWant(250).x, anvilWant(250).z),
  'anvil-2': fitLedge(anvilWant(450).x, anvilWant(450).z),
  'anvil-3': fitLedge(anvilWant(650).x, anvilWant(650).z),
} as const;
const LEDGE_KEEP_OUT = Object.entries(LEDGE_SPOTS).map(([id, p]) => ({ id: `ledge-${id}`, x: p.x, z: p.z, r: 25 }));

/** Circles other layouts keep clear of (A2's POI placement): centre and radius per site. */
export const CINDERREACH_KEEP_OUT: ReadonlyArray<{ id: string; x: number; z: number; r: number }> = [
  { id: 'cinderford', x: CINDERFORD.x, z: CINDERFORD.z, r: 380 },
  { id: 'stonefold', x: STONEFOLD.x, z: STONEFOLD.z, r: 150 },
  { id: 'den-shelf', x: DEN_SHELF.x, z: DEN_SHELF.z, r: 45 },
  { id: 'scorchhold', x: SCORCHHOLD.x, z: SCORCHHOLD.z, r: 150 },
  { id: 'hushed-anvil', x: HUSHED_ANVIL.x, z: HUSHED_ANVIL.z, r: 70 },
  { id: 'pasture-fold', x: PASTURE_FOLD.x, z: PASTURE_FOLD.z, r: 60 },
  { id: 'hunters-camp', x: SITES_FIT.camp.centre.x, z: SITES_FIT.camp.centre.z, r: 70 },
  { id: 'hound-den', x: SITES_FIT.houndDen.x, z: SITES_FIT.houndDen.z, r: 40 },
  { id: 'kindling-dell', x: SITES_FIT.dell.x, z: SITES_FIT.dell.z, r: 35 },
  ...SITES_FIT.hollows.map((h, i) => ({ id: `fog-hollow-${i + 1}`, x: h.x, z: h.z, r: 30 })),
  ...LEDGE_KEEP_OUT,
  { id: 'm11-stone', x: M11_STONE.x, z: M11_STONE.z, r: 30 },
];
