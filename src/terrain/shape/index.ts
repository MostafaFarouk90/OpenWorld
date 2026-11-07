// The world's terrain shape (core). Each feature's data lives in its owner's file.
import type { TerrainShape } from '../shaping';
import { CINDERREACH_FOOTHILLS, CINDERREACH_PLATEAUS, CINDERREACH_ROADS } from './cinderRoad';
import { DEAD_ROAD, DEAD_ROAD_PLATEAUS } from './deadRoad';
import { DRAGONSPINE_PLATEAUS, DRAGONSPINE_ROADS, DRAGONSPINE_TROUGHS, DRAGONSPINE_UPLIFTS } from './dragonspine';
import { GREYFEN_FLATS, GREYFEN_PLATEAUS, GREYFEN_ROADS, GREYFEN_TROUGHS } from './greyfen';
import { HARROWMARK_PLATEAU, HARROWMARK_RIDGES } from './harrowmark';
import { OLDSMOKE_PLATEAUS, OLDSMOKE_ROADS } from './oldsmokePass';
import { WASTE_FLATS, WASTE_PLATEAUS, WASTE_ROADS, WASTE_UPLIFTS } from './waste';
import { CALDERA_FLATS, CALDERA_PLATEAUS, CALDERA_ROADS, CALDERA_TROUGHS, CALDERA_WASTE_SIDE_PLATEAUS } from './caldera';

export const WORLD_SHAPE: TerrainShape = {
  suppressions: [HARROWMARK_RIDGES, CINDERREACH_FOOTHILLS],
  plateaus: [HARROWMARK_PLATEAU, ...DEAD_ROAD_PLATEAUS, ...CINDERREACH_PLATEAUS, ...OLDSMOKE_PLATEAUS, ...GREYFEN_PLATEAUS, ...DRAGONSPINE_PLATEAUS, ...WASTE_PLATEAUS, ...CALDERA_PLATEAUS, ...CALDERA_WASTE_SIDE_PLATEAUS],
  // Order matters (v0.6): each road is fitted on the ground with the roads before it laid, so a trunk precedes its branches.
  roads: [DEAD_ROAD, ...CINDERREACH_ROADS, ...OLDSMOKE_ROADS, ...GREYFEN_ROADS, ...DRAGONSPINE_ROADS, ...WASTE_ROADS, ...CALDERA_ROADS],
  // v0.7 (Act 3, K1): applied after suppression and before plateaus, kept out of the shipped regions (act3.ts).
  // Act 4 (L1): the Waste's base flat, the glass-sand plain and the Caldera's rim (waste.ts), inside the Waste's box.
  // Act 5 (N1): the Caldera's bowl (caldera.ts): the terraces ring and the floor, the lake, the gate cut, the ledges.
  flats: [...GREYFEN_FLATS, ...WASTE_FLATS, ...CALDERA_FLATS],
  uplifts: [...DRAGONSPINE_UPLIFTS, ...WASTE_UPLIFTS],
  troughs: [...GREYFEN_TROUGHS, ...DRAGONSPINE_TROUGHS, ...CALDERA_TROUGHS],
};
