import type { Condition, DialogueDef } from '../../quests/types';

const P = 'dialogue.npc-ashdown.';
const classOpen: Condition = { flag: 'story.m07.classOpen', equals: true };
const m07Seen: Condition = { any: [{ quest: 'm07', state: 'active' }, { quest: 'm07', state: 'completed' }] };

export const npcAshdown: DialogueDef = {
  id: 'npc-ashdown',
  start: [
    { when: classOpen, node: 'trainer-open' },
    { when: { all: [m07Seen, { not: classOpen }] }, node: 'trainer-closed' },
    { when: { all: [] }, node: 'idle' },
  ],
  nodes: [
    { id: 'trainer-closed', speaker: 'ashdown', textKey: P + 'trainer-closed', next: null },
    { id: 'trainer-open', speaker: 'ashdown', textKey: P + 'trainer-open', next: 'trainer-open-2' },
    {
      id: 'trainer-open-2', speaker: 'ashdown', textKey: P + 'trainer-open-2',
      choices: [
        { id: 'train', textKey: P + 'trainer-open-2.train', effects: [{ event: 'classes.trainer.open', payload: { classId: 'pathfinder' } }], next: null },
        { id: 'leave', textKey: P + 'trainer-open-2.leave', next: null },
      ],
    },
    { id: 'idle', speaker: 'ashdown', textKey: P + 'idle', next: 'idle-2' },
    { id: 'idle-2', speaker: 'ashdown', textKey: P + 'idle-2', next: null },
  ],
};
