import type { ObjectiveFlag } from '../../../objectiveFlags';

const ids = ['m16', 'r09', 'r10', 'm21', 'm22'] as const;

/** Story flags set by an objective or by the quest starting. `story.m16.started` unlocks Grisel Hall's door (A4). */
export const OLDSMOKE_OBJECTIVE_FLAGS: ObjectiveFlag[] = [
  ...ids.map((q): ObjectiveFlag => ({ quest: q, flag: `story.${q}.started` })),
  // M16: the pass hounds come once the road has been read
  { quest: 'm16', objective: 'search', flag: 'story.m16.houndsOut' },
  // R09: the crawlers wake when the foreman has said where they nest
  { quest: 'r09', objective: 'brief', flag: 'story.r09.nestsOut' },
];
