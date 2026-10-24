import type { ObjectiveFlag } from '../../../../objectiveFlags';
import { LIFT_RESTORED_FLAG } from './m17.quest';
import { R08_LAID_FLAG } from './r08.quest';

/**
 * `story.<id>.started` for both quests (R08 lights nothing else). The winch writes `world.oldsmoke.lift.restored` once, as
 * its objective completes (A4's lift reads it; it is saved with the flags), and laying Pickett to rest hides the ghost.
 */
export const M17R08_OBJECTIVE_FLAGS: ObjectiveFlag[] = [
  { quest: 'm17', flag: 'story.m17.started' },
  { quest: 'r08', flag: 'story.r08.started' },
  { quest: 'm17', objective: 'winch', flag: LIFT_RESTORED_FLAG },
  { quest: 'r08', objective: 'report', flag: R08_LAID_FLAG },
];
