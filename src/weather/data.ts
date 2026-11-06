// Act 4 L3: where the weather plugin takes its rope-lines and shelters from. L1 PR 1 publishes `ROPE_LINES` and
// `SHELTERS` (under src/region/act4/); this module re-exports them once that lands. Until then both are empty, so no
// rope is safe and no shelter shows, and every rule still runs (tests pass their own data).
import type { RopeLineDef, ShelterDef } from './types';

export const WEATHER_DATA: { ropes: readonly RopeLineDef[]; shelters: readonly ShelterDef[] } = {
  ropes: [],
  shelters: [],
};
