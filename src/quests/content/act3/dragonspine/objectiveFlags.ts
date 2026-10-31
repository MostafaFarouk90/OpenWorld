import type { ObjectiveFlag } from '../../../objectiveFlags';

/**
 * `story.<id>.started` for all seven (K4's cave door reads `story.r16.started`; the posts and the quest state read the rest).
 * The completion flags `story.<id>.complete` are the director's.
 */
export const DRAGONSPINE_OBJECTIVE_FLAGS: ObjectiveFlag[] = ['m28', 'r15', 'm29', 'r16', 'm30', 'r17', 'r18'].map((quest) => ({ quest, flag: `story.${quest}.started` }));
