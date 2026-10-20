import type { ObjectiveFlag } from '../objectiveFlags';

/** Story flags set when an objective is done (src/quests/objectiveFlags.ts), read by fires, spawners and walk-offs. */
export const OBJECTIVE_FLAGS: ObjectiveFlag[] = [
  { quest: 'm01', objective: 'tavern', flag: 'story.m01.tavernDoused' },
  { quest: 'm02', objective: 'door', flag: 'story.m02.doorDoused' },
  // the churchyard wraiths rise once Aelfreda's Release lesson is over (not when the verb unlocks mid-talk)
  { quest: 'm03', objective: 'o5', flag: 'story.m03.releaseTaught' },
  // the ford pairs stand up once Gaut's Spare lesson is over
  { quest: 'm04', objective: 'o2', flag: 'story.m04.spareTaught' },
  // the oven-yard wraiths rise once the hearth is dug out
  { quest: 'm02', objective: 'rubble', flag: 'story.m02.rubbleCleared' },
  // the Toll Sergeant steps onto the bridge once his four Footmen are beaten
  { quest: 'm04', objective: 'o3', flag: 'story.m04.sergeantCalled' },
  // the scarecrows stand in the barley once the shawl on the fence is read
  { quest: 'r01', objective: 'shawl', flag: 'story.r01.shawlRead' },
  // batch 2: the shrine push waits for the fifth stone (and so for the pilgrim's journal before it)
  { quest: 'm05', objective: 'o1', flag: 'story.m05.stonesStruck' },
  { quest: 'm05', objective: 'push', flag: 'story.m05.shrineHeld' },
  // the vault door opens once D01 is taken (a quest-level row: set while D01 is active or completed)
  { quest: 'd01', flag: 'story.d01.vaultOpen' },
  // the antechamber walls wake when the three braziers burn; the arena gate opens once those wraiths are down
  { quest: 'd01', objective: 'braziers', flag: 'story.d01.braziersLit' },
  { quest: 'd01', objective: 'wake', flag: 'story.d01.antechamberClear' },
  // the root wakes under the barley once the last scarecrow is cleared
  { quest: 'r01', objective: 'o2', flag: 'story.r01.rootWoke' },
];
