import type { ObjectiveFlag } from '../../../objectiveFlags';

/**
 * `story.<id>.started` for all nine (K3's locks read `story.r13.started`, `story.d05.started`; the posts and the quest
 * state read the rest). The completion flags `story.<id>.complete` are the director's (K7 reads `story.m24.complete`).
 */
export const GREYFEN_OBJECTIVE_FLAGS: ObjectiveFlag[] = ['m23', 'm24', 'r12', 'm25', 'r14', 'r13', 'm26', 'm27', 'd05'].map((quest) => ({ quest, flag: `story.${quest}.started` }));
