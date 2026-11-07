import type { ObjectiveFlag } from '../../../objectiveFlags';
import { WASTE_A4_IDS } from './ids';

/** `story.<id>.started` for every Waste quest (L0's `WASTE_EDGE_OPEN_WHEN` reads M42's; L5's spawners read it; L6 reads D08's). */
export const WASTE_A4_OBJECTIVE_FLAGS: ObjectiveFlag[] = WASTE_A4_IDS.map((quest) => ({ quest, flag: `story.${quest}.started` }));
