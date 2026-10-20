import type { DialogueDef } from '../../quests/types';

const P = 'dialogue.npc-carter-3.';

/** The third carter at Hollin Ford (density pass): saw the Toll Sergeant's men send a sealed cart east. */
export const npcCarter3: DialogueDef = {
  id: 'npc-carter-3',
  start: [
    { when: { all: [{ quest: 'm04', state: 'active' }, { objective: ['m04', 'carters'], done: true }] }, node: 'leaving' },
    { when: { all: [{ quest: 'm04', state: 'active' }, { objective: ['m04', 'wagons'], done: true }] }, node: 'east' },
    { when: { all: [{ quest: 'm04', state: 'active' }, { objective: ['m04', 'o4'], done: true }] }, node: 'chained' },
    { when: { quest: 'm04', state: 'active' }, node: 'afraid' },
    { when: { quest: 'm04', state: 'completed' }, node: 'gone' },
    { when: { all: [] }, node: 'idle' },
  ],
  nodes: [
    { id: 'east', speaker: 'carter-3', textKey: P + 'east', next: 'east-2' },
    { id: 'east-2', speaker: 'carter-3', textKey: P + 'east-2', next: 'east-3' },
    { id: 'east-3', speaker: 'carter-3', textKey: P + 'east-3', next: 'east-4' },
    { id: 'east-4', speaker: 'carter-3', textKey: P + 'east-4', next: null },
    { id: 'afraid', speaker: 'carter-3', textKey: P + 'afraid', next: null },
    { id: 'chained', speaker: 'carter-3', textKey: P + 'chained', next: null },
    { id: 'leaving', speaker: 'carter-3', textKey: P + 'leaving', next: null },
    { id: 'gone', speaker: 'carter-3', textKey: P + 'gone', next: null },
    { id: 'idle', speaker: 'carter-3', textKey: P + 'idle', next: null },
  ],
};
