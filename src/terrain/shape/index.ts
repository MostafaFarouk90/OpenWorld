// The world's terrain shape (core). Each feature's data lives in its owner's file.
import type { TerrainShape } from '../shaping';
import { CINDERREACH_FOOTHILLS, CINDERREACH_PLATEAUS, CINDERREACH_ROADS } from './cinderRoad';
import { DEAD_ROAD, DEAD_ROAD_PLATEAUS } from './deadRoad';
import { DRAGONSPINE_PLATEAUS, DRAGONSPINE_ROADS, DRAGONSPINE_TROUGHS, DRAGONSPINE_UPLIFTS } from './dragonspine';
import { GREYFEN_FLATS, GREYFEN_PLATEAUS, GREYFEN_ROADS, GREYFEN_TROUGHS } from './greyfen';
import { HARROWMARK_PLATEAU, HARROWMARK_RIDGES } from './harrowmark';
import { OLDSMOKE_PLATEAUS, OLDSMOKE_ROADS } from './oldsmokePass';

export const WORLD_SHAPE: TerrainShape = {
  suppressions: [HARROWMARK_RIDGES, CINDERREACH_FOOTHILLS],
  plateaus: [HARROWMARK_PLATEAU, ...DEAD_ROAD_PLATEAUS, ...CINDERREACH_PLATEAUS, ...OLDSMOKE_PLATEAUS, ...GREYFEN_PLATEAUS, ...DRAGONSPINE_PLATEAUS],
  // Order matters (v0.6): each road is fitted on the ground with the roads before it laid, so a trunk precedes its branches.
  roads: [DEAD_ROAD, ...CINDERREACH_ROADS, ...OLDSMOKE_ROADS, ...GREYFEN_ROADS, ...DRAGONSPINE_ROADS],
  // v0.7 (Act 3, K1): applied after suppression and before plateaus, kept out of the shipped regions (act3.ts).
  flats: GREYFEN_FLATS,
  uplifts: DRAGONSPINE_UPLIFTS,
  troughs: [...GREYFEN_TROUGHS, ...DRAGONSPINE_TROUGHS],
};
