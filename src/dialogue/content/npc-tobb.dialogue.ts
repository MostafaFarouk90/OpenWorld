import type { Condition, DialogueDef } from '../../quests/types';

const P = 'dialogue.npc-tobb.';
const m05Active: Condition = { quest: 'm05', state: 'active' };

export const npcTobb: DialogueDef = {
  id: 'npc-tobb',
  start: [
    { when: { all: [{ quest: 'm04', state: 'completed' }, { quest: 'm05', state: 'inactive' }] }, node: 'intro' },
    { when: { all: [m05Active, { objective: ['m05', 'o1'], done: true }, { objective: ['m05', 'o2'], done: true }] }, node: 'done' },
    { when: m05Active, node: 'remind' },
    { when: { all: [{ quest: 'm05', state: 'completed' }, { quest: 'd01', state: 'completed' }] }, node: 'banter-prior' },
    { when: { quest: 'm05', state: 'completed' }, node: 'banter' },
    { when: { all: [] }, node: 'idle' },
  ],
  nodes: [
    { id: 'intro', speaker: 'tobb', textKey: P + 'intro', next: 'intro-2' },
    { id: 'intro-2', speaker: 'tobb', textKey: P + 'intro-2', next: 'intro-3' },
    {
      id: 'intro-3', speaker: 'tobb', textKey: P + 'intro-3',
      choices: [
        { id: 'join', textKey: P + 'intro-3.join', effects: [{ startQuest: 'm05' }], next: 'joined' },
        { id: 'decline', textKey: P + 'intro-3.decline', next: null },
      ],
    },
    { id: 'joined', speaker: 'tobb', textKey: P + 'joined', next: 'joined-2' },
    { id: 'joined-2', speaker: 'tobb', textKey: P + 'joined-2', next: null },
    { id: 'remind', speaker: 'tobb', textKey: P + 'remind', next: 'remind-2' },
    { id: 'remind-2', speaker: 'tobb', textKey: P + 'remind-2', next: null },
    { id: 'done', speaker: 'tobb', textKey: P + 'done', next: 'done-2' },
    { id: 'done-2', speaker: 'tobb', textKey: P + 'done-2', next: null },
    { id: 'banter', speaker: 'tobb', textKey: P + 'banter', next: null },
    { id: 'banter-prior', speaker: 'tobb', textKey: P + 'banter-prior', next: null },
    { id: 'idle', speaker: 'tobb', textKey: P + 'idle', next: null },
  ],
};
