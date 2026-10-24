// Act 3 thread K1 owns this data (contracts/heightfield.md "Terrain shaping", v0.7): the Greyfen Marches pressed to a
// marsh around a 6 m water table, Hathren's Mere, the ferry channels, the causeways and the Fen Road and Fen Track.
// Types only, so the terrain workers can load it. Siblings import these constants, never copies (plans/act3-K1.md).
import type { FlatDef, PlateauDef, RoadDef, TroughDef } from '../shaping';

/** The Greyfen's water table: every fen water plane's surface (engine metres). */
export const GREYFEN_WATER_TABLE = 6;

export const GREYFEN_FLATS: readonly FlatDef[] = [];
export const GREYFEN_TROUGHS: readonly TroughDef[] = [];
export const GREYFEN_PLATEAUS: readonly PlateauDef[] = [];
/** In world-shape order (each road is fitted on the roads before it). */
export const GREYFEN_ROADS: readonly RoadDef[] = [];
