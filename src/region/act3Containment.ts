// Act 3 containment data (contracts v0.7 item 2, plan Part 3.2 and 3.3): the Fen Road and Spine Road corridors through
// null land and the closed summit hole inside the Dragonspine. The containment service registers them at install, so
// they hold from the first tick of every save; each opens on its own condition. K1 lays the real roads and may move the
// points here (the corridor rule test pins the 80 m clearance from every reserved box).
import type { FlagCondition } from '../core/flagCondition';
import { SPINE_ROAD_POINTS as SPINE_ROAD_FITTED } from '../terrain/shape/dragonspine';
import { FEN_ROAD_POINTS as FEN_ROAD_FITTED } from '../terrain/shape/greyfen';
import { SUMMIT_BOX } from './areas';
import type { ContainmentHoleDef, CorridorDef } from './containment';
import { REGION_INFO } from './regions';

/** A corridor's centreline keeps at least this far from every reserved region box, so its 40 m edge stays 40 m outside. */
export const CORRIDOR_RESERVED_CLEARANCE = 80;

/**
 * Harrowmark's north face (the shipped `fog.greyfen` at (7800, 3970)), bending west at once to clear the Ashen Waste's
 * corner (7000, 4500), north along x 6300 to 6800 to the Greyfen corner, then west to Reedgate (plan 3.3).
 */
// v0.7 (K1): the fitted roads (src/terrain/shape), from 600 m inside Harrowmark's box (the North-west Gate's road is
// inside it already) and from Mireweather Hut inside the Greyfen.
export const FEN_ROAD_POINTS: readonly (readonly [number, number])[] = FEN_ROAD_FITTED.slice(1);

/** The Greyfen's east edge to the Dragonspine's west edge, 1.5 km north of the Waste (z 11000), on to Wyrmwatch Lodge. */
export const SPINE_ROAD_POINTS: readonly (readonly [number, number])[] = SPINE_ROAD_FITTED;

export const FEN_ROAD_CORRIDOR: CorridorDef = {
  id: 'corridor.fen-road',
  points: FEN_ROAD_POINTS,
  openWhen: REGION_INFO.greyfen.openWhen,
};

/** Opens with the Dragonspine (so it shares the Phase E hold). */
export const SPINE_ROAD_CORRIDOR: CorridorDef = {
  id: 'corridor.spine-road',
  points: SPINE_ROAD_POINTS,
  openWhen: REGION_INFO.dragonspine.openWhen,
};

export const ACT3_CORRIDORS: readonly CorridorDef[] = [FEN_ROAD_CORRIDOR, SPINE_ROAD_CORRIDOR];

/**
 * The summit opens when M23 to M30, D05 and R16 are complete (plan 2.5, Q12). The same condition gates M31's offer and
 * the `fog.summit` face.
 */
export const SUMMIT_OPEN_WHEN: FlagCondition = {
  all: [
    'story.m23.complete',
    'story.m24.complete',
    'story.m25.complete',
    'story.m26.complete',
    'story.m27.complete',
    'story.m28.complete',
    'story.m29.complete',
    'story.m30.complete',
    'story.d05.complete',
    'story.r16.complete',
  ],
};

export const SUMMIT_HOLE: ContainmentHoleDef = { id: 'hole.dragonspine.summit', box: SUMMIT_BOX, openWhen: SUMMIT_OPEN_WHEN };

export const ACT3_HOLES: readonly ContainmentHoleDef[] = [SUMMIT_HOLE];
