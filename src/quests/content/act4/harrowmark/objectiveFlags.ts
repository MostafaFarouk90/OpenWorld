import type { ObjectiveFlag } from '../../../objectiveFlags';
import { HARROWMARK_A4_PR1_IDS } from './ids';

/** `story.<id>.started` for every quest of the block (L2's Crucible door reads `story.d07.started`; posts read the rest). */
export const HARROWMARK_A4_OBJECTIVE_FLAGS: ObjectiveFlag[] = HARROWMARK_A4_PR1_IDS.map((quest) => ({ quest, flag: `story.${quest}.started` }));
