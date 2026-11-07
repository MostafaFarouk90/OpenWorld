// Act 5 containment (contracts v0.9 item 3, plan Part 3.2): the Caldera opens on `story.gate.a5` (its region's
// `openWhen`); the shipped `hole.caldera` retires on the same flag; the bowl floor is a round hole held until M53 and
// the Phase I hold; the siege's keep-in holds the player at the gate while M52 runs. Registered by the containment
// service at install with the Act 3 and Act 4 data, so it holds from the first tick of every save.
import type { FlagCondition } from '../core/flagCondition';
import type { ContainmentHoleDef, ContainmentKeepInDef } from './containment';
import { phaseHolds } from './regions';
import {
  ACT5_GATE_FLAG,
  CALDERA_CENTRE,
  CALDERA_FLOOR_RADIUS,
  INNER_GATE_FLAG,
  SIEGE_COMPLETE_FLAG,
  SIEGE_STARTED_FLAG,
} from './act5Regions';

/** The bowl floor and the Inner Gate open after M53, once the Phase I hold is retired. */
export const INNER_GATE_OPEN_WHEN: FlagCondition = { all: [INNER_GATE_FLAG, ...phaseHolds('caldera')] };

/** The bowl floor (placeholder circle; N1 sets the radius from the floor wall). */
export const CALDERA_FLOOR_HOLE: ContainmentHoleDef = {
  id: 'hole.caldera.floor',
  circle: { x: CALDERA_CENTRE.x, z: CALDERA_CENTRE.z, r: CALDERA_FLOOR_RADIUS },
  openWhen: INNER_GATE_OPEN_WHEN,
};

export const ACT5_HOLES: readonly ContainmentHoleDef[] = [CALDERA_FLOOR_HOLE];

export const SIEGE_KEEPIN_TOAST = 'region.siege.holdTheGate';
/** M52 running: from its start until it completes (a load mid-siege re-derives it from the flags). */
export const SIEGE_KEEPIN_LIVE_WHEN: FlagCondition = { all: [SIEGE_STARTED_FLAG], none: [SIEGE_COMPLETE_FLAG] };

/**
 * The siege's soft boundary (placeholder box round the Rim Gate's court and the stairs' head; N1 sets the shape). The
 * plan's Rim Gate stands on the Caldera's south edge (engine z 6500) above Rimfoot.
 */
export const SIEGE_KEEPIN: ContainmentKeepInDef = {
  id: 'keepin.caldera.siege',
  box: { x0: 10850, z0: 6300, x1: 11150, z1: 6900 },
  liveWhen: SIEGE_KEEPIN_LIVE_WHEN,
  toastKey: SIEGE_KEEPIN_TOAST,
};

export const ACT5_KEEPINS: readonly ContainmentKeepInDef[] = [SIEGE_KEEPIN];

/** The Caldera's region condition, re-exported for the grid test and the jump. */
export const CALDERA_OPEN_WHEN: FlagCondition = { all: [ACT5_GATE_FLAG] };

export const ACT5_CONTAINMENT_STRINGS_EN: Record<string, string> = {
  [SIEGE_KEEPIN_TOAST]: 'Hold the gate. The wave is on the stairs.',
};
