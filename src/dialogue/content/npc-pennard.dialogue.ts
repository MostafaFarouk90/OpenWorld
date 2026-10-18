import type { Condition, DialogueDef } from '../../quests/types';

const P = 'dialogue.npc-pennard.';
const classOpen: Condition = { flag: 'story.m07.classOpen', equals: true };
const m07Seen: Condition = { any: [{ quest: 'm07', state: 'active' }, { quest: 'm07', state: 'completed' }] };

export const npcPennard: DialogueDef = {
  id: 'npc-pennard',
  start: [
    { when: classOpen, node: 'trainer-open' },
    { when: { all: [m07Seen, { not: classOpen }] }, node: 'trainer-closed' },
    { when: { all: [] }, node: 'idle' },
  ],
  nodes: [
    { id: 'trainer-closed', speaker: 'pennard', textKey: P + 'trainer-closed', next: null },
    { id: 'trainer-open', speaker: 'pennard', textKey: P + 'trainer-open', next: 'trainer-open-2' },
    {
      id: 'trainer-open-2', speaker: 'pennard', textKey: P + 'trainer-open-2',
      choices: [
        { id: 'train', textKey: P + 'trainer-open-2.train', effects: [{ event: 'classes.trainer.open', payload: { classId: 'emberwright' } }], next: null },
        { id: 'leave', textKey: P + 'trainer-open-2.leave', next: null },
      ],
    },
    { id: 'idle', speaker: 'pennard', textKey: P + 'idle', next: null },
  ],
};
