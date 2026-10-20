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

  // ---- batch 3: Harrowmark part 1 ----
  // Through the gate by any route: the stealth section writes the route here (a bribe or an argument already wrote
  // theirs), which opens the gate while Rook waits at the brazier inside.
  { quest: 'm06', objective: 'o2', flag: 'story.m06.route', value: 'stealth' },
  { quest: 'm06', objective: 'o2', flag: 'story.m06.gateOpen' },
  // the refugees come in once Cael has told them the brazier will judge them too
  { quest: 'm06', objective: 'word', flag: 'story.m06.queueTested' },
  // the thieves wait in the alley until Cael has followed the coins there
  { quest: 'm07', objective: 'coins', flag: 'story.m07.trailFollowed' },
  // R03: the thugs move once the doorman has had his word; Pellam comes out once they are down; the snatch waits for
  // the copper and stops once its two cutpurses are dealt with
  { quest: 'r03', objective: 'doorman', flag: 'story.r03.doormanTalked' },
  { quest: 'r03', objective: 'o2', flag: 'story.r03.thugsBeaten' },
  { quest: 'r03', objective: 'o3', flag: 'story.r03.copperTaken' },
  { quest: 'r03', objective: 'snatch', flag: 'story.r03.snatchBeaten' },
  // R04: the Archive stacks open with Whitlock's key (and stay open); Crabbe waits on the steps once the pages are in
  { quest: 'r04', objective: 'stacks', flag: 'story.r04.stacksOpen' },
  { quest: 'r04', objective: 'o2', flag: 'story.r04.pagesFound' },
];
