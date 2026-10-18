import type { DialogueDef } from '../../quests/types';
import { npcStane } from './npc-stane.dialogue';
import { npcEdda } from './npc-edda.dialogue';
import { npcGaut } from './npc-gaut.dialogue';
import { npcAelfreda } from './npc-aelfreda.dialogue';
import { npcWynn } from './npc-wynn.dialogue';
import { npcTobb } from './npc-tobb.dialogue';
import { npcCarter1 } from './npc-carter-1.dialogue';
import { npcCarter2 } from './npc-carter-2.dialogue';
import { t04Vow } from './t04-vow.dialogue';

export const dialogueDefs: DialogueDef[] = [
  npcStane, npcEdda, npcGaut, npcAelfreda, npcWynn, npcTobb, npcCarter1, npcCarter2, t04Vow,
];
