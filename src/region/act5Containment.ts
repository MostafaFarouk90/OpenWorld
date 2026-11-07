// Act 5 containment (contracts v0.9 item 3, plan Part 3.2): the Caldera opens on `story.gate.a5` (its region's
// `openWhen`); the shipped `hole.caldera` retires on the same flag; the bowl floor is a round hole held until M53 and
// the Phase I hold; the siege's keep-in holds the player at the gate while M52 runs. Registered by the containment
// service at install with the Act 3 and Act 4 data, so it holds from the first tick of every save.
import type { FlagCondition } from '../core/flagCondition';
import type { ContainmentHoleDef, ContainmentKeepInDef } from './containment';
import { phaseHolds } from './regions';
import {
  ACT5_GATE_FLAG,
  CALDERA_ANVIL_RADIUS,
  CALDERA_CENTRE,
  CALDERA_FLOOR_RADIUS,
  D10_STARTED_FLAG,
  INNER_GATE_FLAG,
  SIEGE_COMPLETE_FLAG,
  SIEGE_STARTED_FLAG,
  ULTHRED_OUTCOME_FLAG,
} from './act5Regions';

/** The bowl floor and the Inner Gate open after M53, once the Phase I hold is retired. */
export const INNER_GATE_OPEN_WHEN: FlagCondition = { all: [INNER_GATE_FLAG, ...phaseHolds('caldera')] };

/** The bowl floor, inside N1's floor wall (r 520): the Inner Gate's face stands on its edge. */
export const CALDERA_FLOOR_HOLE: ContainmentHoleDef = {
  id: 'hole.caldera.floor',
  circle: { x: CALDERA_CENTRE.x, z: CALDERA_CENTRE.z, r: CALDERA_FLOOR_RADIUS },
  openWhen: INNER_GATE_OPEN_WHEN,
};

/**
 * The Anvil's island and its lava lake (N1, coordinator ruling 2026-11-07): the causeway makes them walkable once the
 * floor opens, but D10's phases 2 and 3 are reached by its floor drop, so they hold until D10 starts. They also open on
 * Ulthred's outcome, so a load after the fight never strands anyone.
 */
export const ANVIL_OPEN_WHEN: FlagCondition = { any: [D10_STARTED_FLAG, ULTHRED_OUTCOME_FLAG] };
export const CALDERA_ANVIL_HOLE: ContainmentHoleDef = {
  id: 'hole.caldera.anvil',
  circle: { x: CALDERA_CENTRE.x, z: CALDERA_CENTRE.z, r: CALDERA_ANVIL_RADIUS },
  openWhen: ANVIL_OPEN_WHEN,
};

export const ACT5_HOLES: readonly ContainmentHoleDef[] = [CALDERA_FLOOR_HOLE, CALDERA_ANVIL_HOLE];

export const SIEGE_KEEPIN_TOAST = 'region.siege.holdTheGate';
/** M52 running: from its start until it completes (a load mid-siege re-derives it from the flags). */
export const SIEGE_KEEPIN_LIVE_WHEN: FlagCondition = { all: [SIEGE_STARTED_FLAG], none: [SIEGE_COMPLETE_FLAG] };

/**
 * The siege's soft boundary (N1): the Rim Gate's outer landing (Wystan's sally), the court in the cut, the Rim Camp, with
 * the Lava Stair's head as its north edge and the camp's west edge as its west (plan 3.3).
 */
export const SIEGE_KEEPIN: ContainmentKeepInDef = {
  id: 'keepin.caldera.siege',
  box: { x0: 10860, z0: 6400, x1: 11180, z1: 6830 },
  liveWhen: SIEGE_KEEPIN_LIVE_WHEN,
  toastKey: SIEGE_KEEPIN_TOAST,
};

export const ACT5_KEEPINS: readonly ContainmentKeepInDef[] = [SIEGE_KEEPIN];

/** The Caldera's region condition, re-exported for the grid test and the jump. */
export const CALDERA_OPEN_WHEN: FlagCondition = { all: [ACT5_GATE_FLAG] };

export const ACT5_CONTAINMENT_STRINGS_EN: Record<string, string> = {
  [SIEGE_KEEPIN_TOAST]: 'Hold the gate. The wave is on the stairs.',
};
