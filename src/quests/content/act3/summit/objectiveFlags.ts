import type { ObjectiveFlag } from '../../../objectiveFlags';

/** `story.<id>.started` for all five (K4's keep door and K8's Skarl arm read `story.d06.started`). The completion flags are the director's. */
export const SUMMIT_OBJECTIVE_FLAGS: ObjectiveFlag[] = ['m31', 'm32', 'm33', 'm34', 'd06'].map((quest) => ({ quest, flag: `story.${quest}.started` }));
