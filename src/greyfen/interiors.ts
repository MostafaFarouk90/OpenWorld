// The Greyfen's interiors for `src/interiors/act3/index.ts` (shared with K4), and their door locks.
import type { InteriorDef } from '../interiors/types';
import { CHAPEL_DEF, CHAPEL_DOOR_ID, CHAPEL_LOCK_FLAG } from './chapelInterior';
import { DEEPS_DEF, DEEPS_DOOR_ID, DEEPS_LOCK_FLAG, SLUICE_FLAGS, SLUICE_GATES } from './deepsInterior';
import { HUT_DEF } from './hutInterior';

export const GREYFEN_INTERIORS: readonly InteriorDef[] = [HUT_DEF, CHAPEL_DEF, DEEPS_DEF];

/** Entering only (exits never lock); K12 writes the flags. The exit-only far doors have no outside prompt at all. */
export const GREYFEN_DOOR_LOCKS: Readonly<Record<string, string>> = {
  [CHAPEL_DOOR_ID]: CHAPEL_LOCK_FLAG,
  [DEEPS_DOOR_ID]: DEEPS_LOCK_FLAG,
};

/** D05's sluice gates open on K12's sluice flags (built closed; re-derived on a load through the interiors plugin's gates). */
export const GREYFEN_FLAG_BLOCKERS: Readonly<Record<string, string>> = {
  [SLUICE_GATES[0]]: SLUICE_FLAGS[0],
  [SLUICE_GATES[1]]: SLUICE_FLAGS[1],
};
