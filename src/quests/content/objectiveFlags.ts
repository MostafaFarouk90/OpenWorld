import type { ObjectiveFlag } from '../objectiveFlags';

/** Story flags set when an objective is done (src/quests/objectiveFlags.ts), read by fires, spawners and walk-offs. */
export const OBJECTIVE_FLAGS: ObjectiveFlag[] = [
  { quest: 'm01', objective: 'tavern', flag: 'story.m01.tavernDoused' },
  { quest: 'm02', objective: 'door', flag: 'story.m02.doorDoused' },
  // the oven-yard wraiths rise once the hearth is dug out
  { quest: 'm02', objective: 'rubble', flag: 'story.m02.rubbleCleared' },
  // the Toll Sergeant steps onto the bridge once his four Footmen are beaten
  { quest: 'm04', objective: 'o3', flag: 'story.m04.sergeantCalled' },
  // the root wakes under the barley once the last scarecrow is cleared
  { quest: 'r01', objective: 'o2', flag: 'story.r01.rootWoke' },
];
