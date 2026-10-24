import type { DialogueDef } from '../../quests/types';
import { npcStane } from './npc-stane.dialogue';
import { npcEdda } from './npc-edda.dialogue';
import { npcHob } from './npc-hob.dialogue';
import { npcWynn } from './npc-wynn.dialogue';
import { npcTobb } from './npc-tobb.dialogue';
import { npcCarter1 } from './npc-carter-1.dialogue';
import { npcCarter2 } from './npc-carter-2.dialogue';
import { t04Vow } from './t04-vow.dialogue';
import { npcRook } from './npc-rook.dialogue';
import { npcAldith } from './npc-aldith.dialogue';
import { npcMerrin } from './npc-merrin.dialogue';
import { npcGerta } from './npc-gerta.dialogue';
import { npcWhitlock } from './npc-whitlock.dialogue';
import { npcAshdown } from './npc-ashdown.dialogue';
import { sceneAct1Camp } from './scene-act1-camp.dialogue';
import { npcCarter3 } from './npc-carter-3.dialogue';
import { npcAldwin } from './npc-aldwin.dialogue';
import { npcGarrick } from './npc-garrick.dialogue';
import { NOTE_DIALOGUES } from './notes.dialogue';
import { npcRefugee1, npcRefugee2 } from './npc-refugees.dialogue';
import { npcStallholder1, npcStallholder2 } from './npc-stallholders.dialogue';
import { npcGuildDoorman, npcPellam } from './npc-guild-r03.dialogue';
import { npcCrabbe, npcFence, npcSexton } from './npc-r04-witnesses.dialogue';
import { npcArmourer, npcClerk, npcGrisel, npcKeepGuard, npcWace } from './npc-court.dialogue';
import { ACT2_DIALOGUES, ACT2_EXTENDED_DIALOGUES } from './act2';
import { npcAelfredaCompanion } from '../../companions/dialogue/npcAelfredaCompanion.dialogue';
import { withAct3Trainers } from './act3/trainers';

// Act 3 (K10): the four Harrowmark trainers get their master-book lines in front.
export const dialogueDefs: DialogueDef[] = withAct3Trainers([
  npcStane, npcEdda, npcHob, npcWynn, npcTobb, npcCarter1, npcCarter2, t04Vow,
  npcRook, npcAldith, npcMerrin, npcGerta, npcWhitlock, npcAshdown, sceneAct1Camp,
  npcCarter3, npcAldwin, npcGarrick, ...NOTE_DIALOGUES,
  // Act 1 density pass, batch 3 (Harrowmark part 1)
  npcRefugee1, npcRefugee2, npcStallholder1, npcStallholder2, npcGuildDoorman, npcPellam, npcSexton, npcFence, npcCrabbe,
  // batch 4 (Harrowmark part 2)
  npcArmourer, npcKeepGuard, npcGrisel, npcClerk, npcWace,
  // Act 2 (A5): Sister Aelfreda's companion talk, the Hearth Rite
  npcAelfredaCompanion,
  // Act 2 (A12): Cinderreach quest trees, and Gaut, Aelfreda and Pennard with their Act 2 rules in front
  ...ACT2_EXTENDED_DIALOGUES, ...ACT2_DIALOGUES,
]);
