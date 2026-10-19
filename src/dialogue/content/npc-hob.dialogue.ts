import type { DialogueDef } from '../../quests/types';

const P = 'dialogue.npc-hob.';

/** Hob Waygrey, the waystone keeper: three short lines teaching fast travel during T14, then a reminder. */
export const npcHob: DialogueDef = {
  id: 'npc-hob',
  start: [
    { when: { quest: 't14', state: 'active' }, node: 'travel' },
    { when: { all: [] }, node: 'idle' },
  ],
  nodes: [
    { id: 'travel', speaker: 'hob', textKey: P + 'travel', next: 'travel2' },
    { id: 'travel2', speaker: 'hob', textKey: P + 'travel2', next: 'travel3' },
    { id: 'travel3', speaker: 'hob', textKey: P + 'travel3', next: null },
    { id: 'idle', speaker: 'hob', textKey: P + 'idle', next: null },
  ],
};
