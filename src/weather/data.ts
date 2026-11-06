// Act 4 L3: where the weather plugin takes its rope-lines and shelters from: L1's `ROPE_LINES` and `SHELTERS`
// (src/region/act4/ropeLines.ts), anchor ids resolved by the plugin. Positions are never copied here.
import { ROPE_LINES, SHELTERS } from '../region/act4/ropeLines';
import type { RopeLineDef, ShelterDef } from './types';

export const WEATHER_DATA: { ropes: readonly RopeLineDef[]; shelters: readonly ShelterDef[] } = {
  ropes: ROPE_LINES,
  shelters: SHELTERS,
};
