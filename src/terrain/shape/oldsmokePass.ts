// Act 2 thread A1 owns this data (contracts/heightfield.md "Terrain shaping"): the pass road from Cinderford north to
// Deepgate and Deepgate's plateau. Types only, so the terrain workers can load it. Fitted on the real `heightAt`.
import type { PlateauDef, RoadDef } from '../shaping';
import type { RoadPolyline } from './cinderRoad';

/** Deepgate, the Grisel mine-town at the pass's head (A4 builds it). */
export const DEEPGATE_PLATEAU: PlateauDef = { id: 'deepgate', box: { minX: 20300, maxX: 20800, minZ: 7750, maxZ: 8250 }, height: 6, blend: 200 };

export const OLDSMOKE_PASS_POINTS: RoadPolyline = [
  [21400, 2600],
  [21500, 3200],
  [21350, 4200],
  [21500, 5000],
  [21250, 5800],
  [21100, 6300],
  [20800, 7000],
  [20565.6, 7750],
];
/** From Cinderford's east edge to Deepgate, about 5.4 km (the design's 9.5 km is centre to centre; logged). */
export const OLDSMOKE_PASS_ROAD: RoadDef = {
  id: 'oldsmoke-pass',
  points: OLDSMOKE_PASS_POINTS.map(([x, z]) => ({ x, z })),
  halfWidth: 6,
  blend: 30,
  maxGrade: 0.08,
  startTaper: 0,
  maxSideSlope: 0.6,
};

/** Three smoke stacks on Deepgate's north-east corner: A1 draws the columns and plumes, A4 the furnace houses at their feet. */
export const OLDSMOKE_STACKS: readonly { x: number; z: number }[] = [
  { x: 20680, z: 8180 },
  { x: 20730, z: 8150 },
  { x: 20780, z: 8190 },
];

export const OLDSMOKE_PLATEAUS: readonly PlateauDef[] = [DEEPGATE_PLATEAU];
export const OLDSMOKE_ROADS: readonly RoadDef[] = [OLDSMOKE_PASS_ROAD];
