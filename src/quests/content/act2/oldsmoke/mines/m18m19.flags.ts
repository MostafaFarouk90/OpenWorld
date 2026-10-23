import type { ObjectiveFlag } from '../../../../objectiveFlags';
import { M18_CRAWLERS_FLAG } from './m18.quest';
import { M19_DOOR_OPEN_FLAG } from './m19.quest';

/**
 * `story.<id>.started` for both quests. The apprentice's lore wakes the cavern crawlers (so the kill count starts with the
 * objective, not from a spawn the player never saw), and the third lock opens the sealed door.
 */
export const M18M19_OBJECTIVE_FLAGS: ObjectiveFlag[] = [
  { quest: 'm18', flag: 'story.m18.started' },
  { quest: 'm19', flag: 'story.m19.started' },
  { quest: 'm18', objective: 'lore', flag: M18_CRAWLERS_FLAG },
  { quest: 'm19', objective: 'doors', flag: M19_DOOR_OPEN_FLAG },
];
