import type { DialogueDef } from '../../quests/types';

const P = 'dialogue.npc-carter-2.';

export const npcCarter2: DialogueDef = {
  id: 'npc-carter-2',
  start: [
    {
      when: {
        all: [
          { quest: 'm04', state: 'active' },
          { objective: ['m04', 'o4'], done: true },
          { objective: ['m04', 'o5'], done: false },
        ],
      },
      node: 'thanks',
    },
    { when: { all: [{ quest: 'm04', state: 'active' }, { objective: ['m04', 'o4'], done: true }] }, node: 'leaving' },
    { when: { quest: 'm04', state: 'active' }, node: 'afraid' },
    { when: { quest: 'm04', state: 'completed' }, node: 'gone' },
    { when: { all: [] }, node: 'idle' },
  ],
  nodes: [
    { id: 'thanks', speaker: 'carter-2', textKey: P + 'thanks', next: 'thanks-2' },
    { id: 'thanks-2', speaker: 'carter-2', textKey: P + 'thanks-2', next: null },
    { id: 'leaving', speaker: 'carter-2', textKey: P + 'leaving', next: null },
    { id: 'afraid', speaker: 'carter-2', textKey: P + 'afraid', next: null },
    { id: 'gone', speaker: 'carter-2', textKey: P + 'gone', next: null },
    { id: 'idle', speaker: 'carter-2', textKey: P + 'idle', next: null },
  ],
};
