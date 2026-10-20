import type { Condition, DialogueDef } from '../../quests/types';

const P = 'dialogue.npc-wynn.';
const r01Active: Condition = { quest: 'r01', state: 'active' };
const completed: Condition = { quest: 'r01', state: 'completed' };
const scorched: Condition = { flag: 'story.r01.scorched', equals: true };

export const npcWynn: DialogueDef = {
  id: 'npc-wynn',
  start: [
    { when: { all: [{ quest: 'm02', state: 'completed' }, { quest: 'r01', state: 'inactive' }] }, node: 'offer' },
    { when: { all: [r01Active, { objective: ['r01', 'aftermath'], done: true }, scorched] }, node: 'done-scorched' },
    { when: { all: [r01Active, { objective: ['r01', 'aftermath'], done: true }] }, node: 'done-saved' },
    { when: { all: [r01Active, { objective: ['r01', 'root'], done: true }, scorched] }, node: 'after-scorched' },
    { when: { all: [r01Active, { objective: ['r01', 'root'], done: true }] }, node: 'after-saved' },
    { when: { all: [r01Active, { objective: ['r01', 'o2'], done: true }] }, node: 'root' },
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
    { id: 'brief-2', speaker: 'wynn', textKey: P + 'brief-2', next: 'ask' },
    {
      id: 'ask', speaker: 'wynn', textKey: P + 'ask',
      choices: [
        { id: 'why', textKey: P + 'ask.why', next: 'why' },
        { id: 'fields', textKey: P + 'ask.fields', next: 'fields' },
        { id: 'go', textKey: P + 'ask.go', next: null },
      ],
    },
    { id: 'why', speaker: 'wynn', textKey: P + 'why', next: 'why-2' },
    { id: 'why-2', speaker: 'wynn', textKey: P + 'why-2', next: 'ask' },
    { id: 'fields', speaker: 'wynn', textKey: P + 'fields', next: 'ask' },
    { id: 'root', speaker: 'wynn', textKey: P + 'root', next: null },
    { id: 'after-saved', speaker: 'wynn', textKey: P + 'after-saved', next: null },
    { id: 'after-scorched', speaker: 'wynn', textKey: P + 'after-scorched', next: null },
    { id: 'done-saved', speaker: 'wynn', textKey: P + 'done-saved', next: 'clothes' },
    { id: 'done-scorched', speaker: 'wynn', textKey: P + 'done-scorched', next: 'clothes' },
    // what becomes of the mourning clothes (story.r01.clothes)
    {
      id: 'clothes', speaker: 'wynn', textKey: P + 'clothes',
      choices: [
        { id: 'chapel', textKey: P + 'clothes.chapel', effects: [{ setFlag: 'story.r01.clothes', value: 'chapel' }], next: 'clothes-chapel' },
        { id: 'burn', textKey: P + 'clothes.burn', effects: [{ setFlag: 'story.r01.clothes', value: 'burned' }], next: 'clothes-burn' },
      ],
    },
    { id: 'clothes-chapel', speaker: 'wynn', textKey: P + 'clothes-chapel', next: 'done' },
    { id: 'clothes-burn', speaker: 'wynn', textKey: P + 'clothes-burn', next: 'done' },
    { id: 'later', speaker: 'wynn', textKey: P + 'later', next: null },
    { id: 'remind', speaker: 'wynn', textKey: P + 'remind', next: null },
    { id: 'done', speaker: 'wynn', textKey: P + 'done', next: 'done-2' },
    { id: 'done-2', speaker: 'wynn', textKey: P + 'done-2', next: null },
    { id: 'idle-scorched', speaker: 'wynn', textKey: P + 'idle-scorched', next: null },
    { id: 'idle-saved', speaker: 'wynn', textKey: P + 'idle-saved', next: null },
    { id: 'idle', speaker: 'wynn', textKey: P + 'idle', next: null },
  ],
};
