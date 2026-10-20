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
  // the portcullis rises under guard once Cael has heard the queue (src/harrowmark/gate.ts M06_GUARDED_FLAG)
  { quest: 'm06', objective: 'queue', flag: 'story.m06.queueHeard' },
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

  // ---- batch 4: Harrowmark part 2 ----
  // M08: the Keep door opens once the warden has seen the Watch Pass (src/interiors/harrowmark/locks.ts)
  { quest: 'm08', objective: 'pass', flag: 'story.m08.keepOpen' },
  // M09: the clerk's key opens the Counting-House side door, however Cael came by it
  { quest: 'm09', objective: 'key', flag: 'story.m09.houseOpen' },
  // Simeon sits on the Anvil's bench once M09 has started (a quest-level row, so an old save catches up on load)
  { quest: 'm09', flag: 'story.m09.started' },
  // the quiet way writes its route here (a drink or Merrin's name already wrote theirs)
  { quest: 'm09', objective: 'key', flag: 'story.m09.keyRoute', value: 'lifted' },
  // M10: Vey's men come for the sealed orders once Cael has them, and stop once beaten; the Ashmare is Cael's once
  // Gerta has the orders (her hand-in node writes it first; this row catches an old save up)
  { quest: 'm10', objective: 'orders', flag: 'story.m10.ordersTaken' },
  { quest: 'm10', objective: 'ambush', flag: 'story.m10.ambushBeaten' },
  { quest: 'm10', objective: 'o4', flag: 'story.m10.ashmare' },
  // D02: Rook's stray is gone once dealt with; the flooded tunnel's hounds come with the drained water; the arena gate
  // opens once they are dealt with (src/interiors/harrowmark/locks.ts)
  { quest: 'd02', objective: 'stray', flag: 'story.d02.strayDealt' },
  // the Underways door opens once Rook has had his word on the strays (so the kennels cannot be emptied before o3 counts)
  { quest: 'd02', objective: 'lesson', flag: 'story.d02.underwaysOpen' },
  { quest: 'd02', objective: 'valves', flag: 'story.d02.valvesOpen' },
  { quest: 'd02', objective: 'sluice', flag: 'story.d02.sluiceClear' },
];
