// Act 3 thread K1 owns this data (contracts/heightfield.md "Terrain shaping", v0.7): the Dragonspine massif raised on
// the lowland (summit about 600 m under a 630 m soft ceiling), the Frostfang chasm, the site plateaus, the Rime Pass,
// the Skyhold spur, the Spine Road's east end and the Deepgate Track. Types only, so the terrain workers can load it.
import type { PlateauDef, RoadDef, TroughDef, UpliftDef } from '../shaping';

export const DRAGONSPINE_UPLIFTS: readonly UpliftDef[] = [];
export const DRAGONSPINE_TROUGHS: readonly TroughDef[] = [];
export const DRAGONSPINE_PLATEAUS: readonly PlateauDef[] = [];
/** In world-shape order (each road is fitted on the roads before it). */
export const DRAGONSPINE_ROADS: readonly RoadDef[] = [];
