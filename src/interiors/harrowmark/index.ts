import type { InteriorDef } from '../types';
import { ARCHIVE_DEF } from './archive';
import { COUNTING_HOUSE_DEF } from './countingHouse';
import { KEEP_HALL_DEF } from './keepHall';
import { TILTED_ANVIL_DEF } from './tiltedAnvil';

export { ARCHIVE_DEF, ARCHIVE_ID } from './archive';
export { COUNTING_HOUSE_DEF, COUNTING_HOUSE_ID } from './countingHouse';
export { KEEP_HALL_DEF, KEEP_HALL_ID } from './keepHall';
export { TILTED_ANVIL_BACKROOM_GATE, TILTED_ANVIL_DEF, TILTED_ANVIL_ID } from './tiltedAnvil';

/** The above-ground Harrowmark interiors (the underways are defined separately). */
export const HARROWMARK_INTERIORS: readonly InteriorDef[] = [TILTED_ANVIL_DEF, KEEP_HALL_DEF, COUNTING_HOUSE_DEF, ARCHIVE_DEF];
