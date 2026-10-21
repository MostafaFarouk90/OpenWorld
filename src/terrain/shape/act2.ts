// Act 2 thread A1: the Act 2 terrain features as lists (siblings and tests read them; the world shape lists them itself).
import type { PlateauDef, RoadDef } from '../shaping';
import { CINDERREACH_PLATEAUS, CINDERREACH_ROADS } from './cinderRoad';
import { OLDSMOKE_PLATEAUS, OLDSMOKE_ROADS } from './oldsmokePass';

/** Cinderford, Stonefold, the den shelf, Scorchhold, the Hushed Anvil and Deepgate. */
export const ACT2_PLATEAUS: readonly PlateauDef[] = [...CINDERREACH_PLATEAUS, ...OLDSMOKE_PLATEAUS];
/** The Cinder Road, its four branches and the Oldsmoke pass, in world-shape order. */
export const ACT2_ROADS: readonly RoadDef[] = [...CINDERREACH_ROADS, ...OLDSMOKE_ROADS];
