import type { DialogueDef } from '../../quests/types';

export const npcStane: DialogueDef = {
  id: 'npc-stane',
  start: [
    { when: { quest: 't03', state: 'active' }, node: 'wave' },
    { when: { all: [] }, node: 'idle' },
  ],
  nodes: [
    { id: 'wave', speaker: 'stane', textKey: 'dialogue.npc-stane.wave', next: 'wave2' },
    { id: 'wave2', speaker: 'stane', textKey: 'dialogue.npc-stane.wave2', next: 'wave3' },
    { id: 'wave3', speaker: 'cael', textKey: 'dialogue.npc-stane.wave3', next: null },
    { id: 'idle', speaker: 'stane', textKey: 'dialogue.npc-stane.idle', next: null },
  ],
};
