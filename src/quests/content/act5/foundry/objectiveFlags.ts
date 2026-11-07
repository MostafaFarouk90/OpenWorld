import type { ObjectiveFlag } from '../../../objectiveFlags';
import { FOUNDRY_A5_IDS } from './ids';

/** `story.<id>.started` for every Foundry quest (N2's door locks read R27's, D09's; N6 reads D10's). */
export const FOUNDRY_A5_OBJECTIVE_FLAGS: ObjectiveFlag[] = FOUNDRY_A5_IDS.map((quest) => ({ quest, flag: `story.${quest}.started` }));
