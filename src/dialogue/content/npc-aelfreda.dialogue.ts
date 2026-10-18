import type { DialogueDef } from '../../quests/types';

export const npcAelfreda: DialogueDef = {
  id: 'npc-aelfreda',
  start: [
    { when: { quest: 'm01', state: 'active' }, node: 'shard' },
    { when: { all: [] }, node: 'idle' },
  ],
  nodes: [
    { id: 'shard', speaker: 'aelfreda', textKey: 'dialogue.npc-aelfreda.shard', next: 'shard2' },
    { id: 'shard2', speaker: 'aelfreda', textKey: 'dialogue.npc-aelfreda.shard2', next: null },
    { id: 'idle', speaker: 'aelfreda', textKey: 'dialogue.npc-aelfreda.idle', next: null },
  ],
};
