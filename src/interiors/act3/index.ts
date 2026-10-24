// Act 3's interiors, one index (the Act 2 pattern): K3 (the Greyfen) and K4 (the Dragonspine) each add one import line
// here, and `interiors.plugin.ts` spreads `ACT3_INTERIORS`, `ACT3_DOOR_LOCKS` and `ACT3_FLAG_BLOCKERS` once.
import { DRAGONSPINE_DOOR_LOCKS, DRAGONSPINE_FLAG_BLOCKERS, DRAGONSPINE_INTERIORS } from '../../dragonspine/interiors';
import { GREYFEN_DOOR_LOCKS, GREYFEN_FLAG_BLOCKERS, GREYFEN_INTERIORS } from '../../greyfen/interiors';
import type { InteriorDef } from '../types';

export const ACT3_INTERIORS: readonly InteriorDef[] = [...GREYFEN_INTERIORS, ...DRAGONSPINE_INTERIORS];

/** Which flag opens each Act 3 door (entering only; exits never lock). Quest threads write the flags. */
export const ACT3_DOOR_LOCKS: Readonly<Record<string, string>> = {
  ...GREYFEN_DOOR_LOCKS,
  ...DRAGONSPINE_DOOR_LOCKS,
};

/** Which flag opens each Act 3 flag-driven blocker (closed while the flag is false). */
export const ACT3_FLAG_BLOCKERS: Readonly<Record<string, string>> = {
  ...GREYFEN_FLAG_BLOCKERS,
  ...DRAGONSPINE_FLAG_BLOCKERS,
};
