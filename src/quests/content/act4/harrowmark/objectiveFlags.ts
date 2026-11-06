import type { ObjectiveFlag } from '../../../objectiveFlags';
import { HARROWMARK_A4_IDS } from './ids';

/** `story.<id>.started` for every quest of the block (L2's doors read `story.d07.started`, `story.m38.started`
 * and `story.m40.started`; posts read the rest). */
export const HARROWMARK_A4_OBJECTIVE_FLAGS: ObjectiveFlag[] = HARROWMARK_A4_IDS.map((quest) => ({ quest, flag: `story.${quest}.started` }));
