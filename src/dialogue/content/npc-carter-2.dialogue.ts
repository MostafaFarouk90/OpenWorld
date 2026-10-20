import type { DialogueDef } from '../../quests/types';

const P = 'dialogue.npc-carter-2.';

export const npcCarter2: DialogueDef = {
  id: 'npc-carter-2',
  start: [
    // packing up once both carters have been heard out
    { when: { all: [{ quest: 'm04', state: 'active' }, { objective: ['m04', 'carters'], done: true }] }, node: 'leaving' },
    // heard once the wagons are free (credits m04 `carters` with carter-3)
    { when: { all: [{ quest: 'm04', state: 'active' }, { objective: ['m04', 'wagons'], done: true }] }, node: 'seed' },
    { when: { all: [{ quest: 'm04', state: 'active' }, { objective: ['m04', 'o4'], done: true }] }, node: 'thanks' },
    { when: { quest: 'm04', state: 'active' }, node: 'afraid' },
    { when: { quest: 'm04', state: 'completed' }, node: 'gone' },
    { when: { all: [] }, node: 'idle' },
  ],
  nodes: [
    { id: 'seed', speaker: 'carter-2', textKey: P + 'seed', next: 'seed-2' },
    { id: 'seed-2', speaker: 'carter-2', textKey: P + 'seed-2', next: 'seed-3' },
    { id: 'seed-3', speaker: 'carter-2', textKey: P + 'seed-3', next: null },
    { id: 'thanks', speaker: 'carter-2', textKey: P + 'thanks', next: 'thanks-2' },
    { id: 'thanks-2', speaker: 'carter-2', textKey: P + 'thanks-2', next: null },
    { id: 'leaving', speaker: 'carter-2', textKey: P + 'leaving', next: null },
    { id: 'afraid', speaker: 'carter-2', textKey: P + 'afraid', next: null },
    { id: 'gone', speaker: 'carter-2', textKey: P + 'gone', next: null },
    { id: 'idle', speaker: 'carter-2', textKey: P + 'idle', next: null },
  ],
};
