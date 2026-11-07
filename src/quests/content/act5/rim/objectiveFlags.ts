import type { ObjectiveFlag } from '../../../objectiveFlags';
import { RIM_A5_IDS } from './ids';

/** `story.<id>.started` for every Rim quest (N5's Rim spawners and N1 PR 2's sets read them). */
export const RIM_A5_OBJECTIVE_FLAGS: ObjectiveFlag[] = RIM_A5_IDS.map((quest) => ({ quest, flag: `story.${quest}.started` }));
