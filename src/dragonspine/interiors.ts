// The Dragonspine's three interiors, built from K1's `ACT3_INTERIOR_PADS` (src/interiors/act3/index.ts spreads these): the hall and
// the collapsed cave (PR 1), the Frostfang keep (PR 2).
import type { InteriorDef } from '../interiors/types';
import { D06_STARTED_FLAG, R16_ROCKFALL_CLEARED_FLAG, R16_STARTED_FLAG } from './flags';
import { FROSTFANG_KEEP_DOOR_ID, FROSTFANG_KEEP_STRINGS_EN, buildKeepDef } from './frostfangKeep';
import { COLLAPSED_CAVE_DOOR_ID, COLLAPSED_CAVE_STRINGS_EN, ROCKFALL_BLOCKER_ID, buildCaveDef } from './collapsedCave';
import { defaultInputs, padById, type DragonspineInputs } from './inputs';
import { WYRMWATCH_HALL_STRINGS_EN, buildHallDef } from './wyrmwatchHall';

export { CAVE_AREA, COLLAPSED_CAVE_DOOR_ID, COLLAPSED_CAVE_ID, ROCKFALL_BLOCKER_ID } from './collapsedCave';
export { WYRMWATCH_HALL_DOOR_ID, WYRMWATCH_HALL_ID } from './wyrmwatchHall';
export { FROSTFANG_KEEP_DOOR_ID, FROSTFANG_KEEP_ID, KEEP_AREA } from './frostfangKeep';

export function buildDragonspineInteriors(inp: Pick<DragonspineInputs, 'pads'>): InteriorDef[] {
  return [buildHallDef(padById(inp, 'wyrmwatch-hall')), buildCaveDef(padById(inp, 'collapsed-cave')), buildKeepDef(padById(inp, 'frostfang-keep'))];
}

export const DRAGONSPINE_INTERIORS: readonly InteriorDef[] = buildDragonspineInteriors(defaultInputs());

/** Which flag opens each door (entering only; exits never lock). The hall has none: the region itself is held until Phase F. */
export const DRAGONSPINE_DOOR_LOCKS: Readonly<Record<string, string>> = {
  [COLLAPSED_CAVE_DOOR_ID]: R16_STARTED_FLAG,
  [FROSTFANG_KEEP_DOOR_ID]: D06_STARTED_FLAG,
};

/** Blocker id -> the flag that opens it (closed again on a load without the flag). */
export const DRAGONSPINE_FLAG_BLOCKERS: Readonly<Record<string, string>> = {
  [ROCKFALL_BLOCKER_ID]: R16_ROCKFALL_CLEARED_FLAG,
};

export const DRAGONSPINE_INTERIOR_STRINGS_EN: Record<string, string> = { ...WYRMWATCH_HALL_STRINGS_EN, ...COLLAPSED_CAVE_STRINGS_EN, ...FROSTFANG_KEEP_STRINGS_EN };
