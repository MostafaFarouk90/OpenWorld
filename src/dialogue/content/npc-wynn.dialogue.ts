import type { Condition, DialogueDef } from '../../quests/types';

const P = 'dialogue.npc-wynn.';
const r01Active: Condition = { quest: 'r01', state: 'active' };
const completed: Condition = { quest: 'r01', state: 'completed' };

export const npcWynn: DialogueDef = {
  id: 'npc-wynn',
  start: [
    { when: { all: [{ quest: 'm02', state: 'completed' }, { quest: 'r01', state: 'inactive' }] }, node: 'offer' },
    { when: { all: [r01Active, { objective: ['r01', 'o2'], done: true }] }, node: 'done' },
    { when: r01Active, node: 'remind' },
    { when: { all: [completed, { flag: 'world.brightwater.barley', equals: 'scorched' }] }, node: 'idle-scorched' },
    { when: { all: [completed, { flag: 'world.brightwater.barley', equals: 'saved' }] }, node: 'idle-saved' },
    { when: { all: [] }, node: 'idle' },
  ],
  nodes: [
    { id: 'offer', speaker: 'wynn', textKey: P + 'offer', next: 'offer-2' },
    { id: 'offer-2', speaker: 'wynn', textKey: P + 'offer-2', next: 'offer-3' },
    {
      id: 'offer-3', speaker: 'wynn', textKey: P + 'offer-3',
      choices: [
        { id: 'accept', textKey: P + 'offer-3.accept', effects: [{ startQuest: 'r01' }], next: 'brief' },
        { id: 'later', textKey: P + 'offer-3.later', next: 'later' },
      ],
    },
    { id: 'brief', speaker: 'wynn', textKey: P + 'brief', next: 'brief-2' },
    { id: 'brief-2', speaker: 'wynn', textKey: P + 'brief-2', next: null },
    { id: 'later', speaker: 'wynn', textKey: P + 'later', next: null },
    { id: 'remind', speaker: 'wynn', textKey: P + 'remind', next: null },
    { id: 'done', speaker: 'wynn', textKey: P + 'done', next: 'done-2' },
    { id: 'done-2', speaker: 'wynn', textKey: P + 'done-2', next: null },
    { id: 'idle-scorched', speaker: 'wynn', textKey: P + 'idle-scorched', next: null },
    { id: 'idle-saved', speaker: 'wynn', textKey: P + 'idle-saved', next: null },
    { id: 'idle', speaker: 'wynn', textKey: P + 'idle', next: null },
  ],
};
