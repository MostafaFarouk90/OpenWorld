// Act 4 containment data (contracts v0.8 item 3, plan Part 3.2): the Ash Road corridor from Harrowmark's north-east gate
// to Ashgate, the closed Caldera hole inside the Ashen Waste, and the occupied city's rule (Q2). Registered by the
// containment service at install, so it holds from the first tick of every save. L1 lays the real road and may move the
// corridor points (the rule test pins 80 m from the Caldera).
import type { FlagCondition } from '../core/flagCondition';
import type { ContainmentHoleDef, CorridorDef } from './containment';
import { ASH_ROAD_POINTS as ASH_ROAD_SHAPE_POINTS } from '../terrain/shape/waste';
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
 * The Ash Road's fitted centreline (L1, src/terrain/shape/waste.ts) from Harrowmark's north-east gate, past the Underways
 * exit junction and through the shipped `fog.ashen-waste` face, ending on Ashgate's arch point.
 */
export const ASH_ROAD_POINTS: readonly (readonly [number, number])[] = [...ASH_ROAD_SHAPE_POINTS.slice(0, -1), [ASHGATE_POINT.x, ASHGATE_POINT.z]];

export const ASH_ROAD_CORRIDOR: CorridorDef = { id: 'corridor.ash-road', points: ASH_ROAD_POINTS, openWhen: ASH_ROAD_OPEN_WHEN };

/** L1: the refuge camp on Ashgate's plateau, open with the road (its posts are present from M41). */
export const ASHGATE_REFUGE_CORRIDOR: CorridorDef = {
  id: 'corridor.ashgate-refuge',
  points: [
    [9580, 4410],
    [10040, 4410],
  ],
  halfWidth: 60,
  openWhen: ASH_ROAD_OPEN_WHEN,
};

/** L1: Ashgate's arch north into the Waste, open with the Waste's edge face. */
export const ASHGATE_GATE_CORRIDOR: CorridorDef = {
  id: 'corridor.ashgate-gate',
  points: [
    [ASHGATE_POINT.x, ASHGATE_POINT.z],
    [ASHGATE_POINT.x, 4580],
  ],
  halfWidth: 12,
  openWhen: WASTE_EDGE_OPEN_WHEN,
};

export const ACT4_CORRIDORS: readonly CorridorDef[] = [ASH_ROAD_CORRIDOR, ASHGATE_REFUGE_CORRIDOR, ASHGATE_GATE_CORRIDOR];

/** The Caldera (Act 5) is a closed hole inside the open Waste for all of Act 4. */
export const CALDERA_HOLE: ContainmentHoleDef = { id: 'hole.caldera', box: engineBox('caldera'), openWhen: NEVER };

/**
 * L1 (plan act4-L1.md section 4): the Waste's north edge west of the shipped `fog.wyrmwatch-waste` face (x 10000 to
 * 11500) is low walkable ground shared with the Dragonspine. A never-open band along the whole north edge keeps the
 * Waste's only way in at Ashgate, from both sides, in every state.
 */
export const WASTE_NORTH_BAND_HOLE: ContainmentHoleDef = { id: 'hole.waste.north-band', box: { x0: 10000, z0: 10900, x1: 15000, z1: 11000 }, openWhen: NEVER };

export const ACT4_HOLES: readonly ContainmentHoleDef[] = [CALDERA_HOLE, WASTE_NORTH_BAND_HOLE];
