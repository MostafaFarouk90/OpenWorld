// The world's terrain shape (core). Each feature's data lives in its owner's file.
import type { TerrainShape } from '../shaping';
import { DEAD_ROAD, DEAD_ROAD_PLATEAUS } from './deadRoad';
import { HARROWMARK_PLATEAU, HARROWMARK_RIDGES } from './harrowmark';

export const WORLD_SHAPE: TerrainShape = {
  suppressions: [HARROWMARK_RIDGES],
  plateaus: [HARROWMARK_PLATEAU, ...DEAD_ROAD_PLATEAUS],
  roads: [DEAD_ROAD],
};
