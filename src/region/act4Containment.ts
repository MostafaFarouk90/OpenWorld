// Act 4 containment data (contracts v0.8 item 3, plan Part 3.2): the Ash Road corridor from Harrowmark's north-east gate
// to Ashgate, the closed Caldera hole inside the Ashen Waste, and the occupied city's rule (Q2). Registered by the
// containment service at install, so it holds from the first tick of every save. L1 lays the real road and may move the
// corridor points (the rule test pins 80 m from the Caldera).
import type { FlagCondition } from '../core/flagCondition';
import type { ContainmentHoleDef, CorridorDef } from './containment';
import { engineBox } from './regions';

const NEVER: FlagCondition = { any: ['region.never'] };

/** M41 opens the Ash Road (the shipped `fog.ashen-waste` face opens then too). */
export const ASH_ROAD_OPEN_WHEN: FlagCondition = { all: ['story.m41.complete'] };

/** The Waste's edge face north of Ashgate opens with the Waste itself (M42 accepted, the Phase G hold retired). */
export const WASTE_EDGE_OPEN_WHEN: FlagCondition = { all: ['story.m42.started', 'story.phase.wasteOpen'] };

/** Q2: Harrowmark is Vey's from the betrayal (M38) until Act 5. */
export const OCCUPIED_FLAG = 'story.m38.complete';

/** Ashgate (map (11, 5.5)), just outside the Waste's south edge (engine z 4500), plan 3.2. */
export const ASHGATE_POINT = { x: 10000, z: 4450 } as const;

/**
 * Harrowmark's north-east gate (bearing 26 degrees from the city centre (8500, 2000), radius 750), north through the
 * shipped `fog.ashen-waste` face (9900, 3970) to Ashgate. Placeholder points until L1 fits the road.
 */
export const ASH_ROAD_POINTS: readonly (readonly [number, number])[] = [
  [8826, 2676],
  [9300, 3300],
  [9900, 3970],
  [ASHGATE_POINT.x, ASHGATE_POINT.z],
];

export const ASH_ROAD_CORRIDOR: CorridorDef = { id: 'corridor.ash-road', points: ASH_ROAD_POINTS, openWhen: ASH_ROAD_OPEN_WHEN };

export const ACT4_CORRIDORS: readonly CorridorDef[] = [ASH_ROAD_CORRIDOR];

/** The Caldera (Act 5) is a closed hole inside the open Waste for all of Act 4. */
export const CALDERA_HOLE: ContainmentHoleDef = { id: 'hole.caldera', box: engineBox('caldera'), openWhen: NEVER };

/**
 * L1 (plan act4-L1.md section 4): the Waste's north edge west of the shipped `fog.wyrmwatch-waste` face (x 10000 to
 * 11500) is low walkable ground shared with the Dragonspine. A never-open band along the whole north edge keeps the
 * Waste's only way in at Ashgate, from both sides, in every state.
 */
export const WASTE_NORTH_BAND_HOLE: ContainmentHoleDef = { id: 'hole.waste.north-band', box: { x0: 10000, z0: 10900, x1: 15000, z1: 11000 }, openWhen: NEVER };

export const ACT4_HOLES: readonly ContainmentHoleDef[] = [CALDERA_HOLE, WASTE_NORTH_BAND_HOLE];
