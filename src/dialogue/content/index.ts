import type { DialogueDef } from '../../quests/types';
import { npcStane } from './npc-stane.dialogue';
import { npcEdda } from './npc-edda.dialogue';
import { npcGaut } from './npc-gaut.dialogue';
import { npcAelfreda } from './npc-aelfreda.dialogue';
import { t04Vow } from './t04-vow.dialogue';

export const dialogueDefs: DialogueDef[] = [npcStane, npcEdda, npcGaut, npcAelfreda, t04Vow];
