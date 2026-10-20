import type { DialogueDef } from '../../quests/types';

const P = 'dialogue.npc-carter-1.';

export const npcCarter1: DialogueDef = {
  id: 'npc-carter-1',
  start: [
    // carter-1 speaks last (o5): only once the wagons are free and the other two have been heard
    {
      when: {
        all: [
          { quest: 'm04', state: 'active' },
          { objective: ['m04', 'carters'], done: true },
          { objective: ['m04', 'o5'], done: false },
        ],
      },
      node: 'thanks',
    },
    { when: { all: [{ quest: 'm04', state: 'active' }, { objective: ['m04', 'o5'], done: true }] }, node: 'leaving' },
    { when: { all: [{ quest: 'm04', state: 'active' }, { objective: ['m04', 'o4'], done: true }] }, node: 'wait' },
    { when: { quest: 'm04', state: 'active' }, node: 'afraid' },
    { when: { quest: 'm04', state: 'completed' }, node: 'gone' },
    { when: { all: [] }, node: 'idle' },
  ],
  nodes: [
    { id: 'thanks', speaker: 'carter-1', textKey: P + 'thanks', next: 'ox' },
    { id: 'ox', speaker: 'carter-1', textKey: P + 'ox', next: 'thanks-2' },
    { id: 'wait', speaker: 'carter-1', textKey: P + 'wait', next: null },
    { id: 'thanks-2', speaker: 'carter-1', textKey: P + 'thanks-2', effects: [{ setFlag: 'story.m04.cartersFreed', value: true }], next: null },
    { id: 'leaving', speaker: 'carter-1', textKey: P + 'leaving', next: null },
    { id: 'afraid', speaker: 'carter-1', textKey: P + 'afraid', next: null },
    { id: 'gone', speaker: 'carter-1', textKey: P + 'gone', next: null },
    { id: 'idle', speaker: 'carter-1', textKey: P + 'idle', next: null },
  ],
};
