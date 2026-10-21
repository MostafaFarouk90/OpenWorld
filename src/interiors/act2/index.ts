// Act 2's interiors, one index so A3 (Scorchhold's keep) and A4 (Oldsmoke) add their entries here and not to
// `interiors.plugin.ts` or `harrowmark/locks.ts`: the plugin spreads `ACT2_INTERIORS` and `ACT2_DOOR_LOCKS` once.
import { SCORCHHOLD_KEEP_DEF, SCORCHHOLD_KEEP_DOOR_ID } from '../../cinderreach/scorchholdKeep';
import type { InteriorDef } from '../types';

export const ACT2_INTERIORS: readonly InteriorDef[] = [SCORCHHOLD_KEEP_DEF];

/** Which flag opens each Act 2 door (entering only; exits never lock). Quest threads write the flags. */
export const ACT2_DOOR_LOCKS: Readonly<Record<string, string>> = {
  // A12 writes it when D03 is taken.
  [SCORCHHOLD_KEEP_DOOR_ID]: 'story.d03.started',
};
