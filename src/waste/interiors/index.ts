// The Waste's interiors (Act 4 L1 PR 2), one index: `interiors.plugin.ts` spreads `WASTE_INTERIORS` and the door locks once.
import type { InteriorDef } from '../../interiors/types';
import { CINDER_CHAPEL_DEF } from './cinderChapel';
import { HUSK_CATHEDRAL_CRYPT_GATE, HUSK_CATHEDRAL_CRYPT_GATE_FLAG, HUSK_CATHEDRAL_DEF, HUSK_CATHEDRAL_DOOR_ID, HUSK_CATHEDRAL_LOCK_FLAG } from './huskCathedral';

export * from './cinderChapel';
export * from './huskCathedral';

export const WASTE_INTERIORS: readonly InteriorDef[] = [CINDER_CHAPEL_DEF, HUSK_CATHEDRAL_DEF];

/** Entering only (exits never lock); L11 writes the flag. The chapel never locks. */
export const WASTE_DOOR_LOCKS: Readonly<Record<string, string>> = {
  [HUSK_CATHEDRAL_DOOR_ID]: HUSK_CATHEDRAL_LOCK_FLAG,
};

/** Flag-driven blockers (closed while the flag is unset; re-derived on a load): the crypt opens once Eormen's outcome is set. */
export const WASTE_FLAG_BLOCKERS: Readonly<Record<string, string>> = {
  [HUSK_CATHEDRAL_CRYPT_GATE]: HUSK_CATHEDRAL_CRYPT_GATE_FLAG,
};
