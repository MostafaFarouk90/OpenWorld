import type { DialogueDef } from '../../quests/types';

const P = 'dialogue.npc-garrick.';

/**
 * Garrick Thorne, the reeve's man who carried the first torch to the granary (density pass, M02). Talking to him
 * credits m02 `garrick`; the answer is a line-only flag `story.m02.garrick` (forgiven | shamed | silent).
 */
export const npcGarrick: DialogueDef = {
  id: 'npc-garrick',
  start: [
    {
      when: { all: [{ quest: 'm02', state: 'active' }, { objective: ['m02', 'granary'], done: true }, { objective: ['m02', 'garrick'], done: false }] },
      node: 'm02-door',
    },
    { when: { flag: 'story.m02.garrick', equals: 'forgiven' }, node: 'after-forgiven' },
    { when: { quest: 'm02', state: ['active', 'completed'] }, node: 'after' },
    { when: { all: [] }, node: 'idle' },
  ],
  nodes: [
    { id: 'm02-door', speaker: 'garrick', textKey: P + 'm02-door', next: 'm02-door-2' },
    { id: 'm02-door-2', speaker: 'garrick', textKey: P + 'm02-door-2', next: 'm02-door-3' },
    { id: 'm02-door-3', speaker: 'garrick', textKey: P + 'm02-door-3', next: 'm02-door-4' },
    {
      id: 'm02-door-4', speaker: 'garrick', textKey: P + 'm02-door-4',
      choices: [
        { id: 'forgive', textKey: P + 'm02-door-4.forgive', effects: [{ setFlag: 'story.m02.garrick', value: 'forgiven' }], next: 'forgiven' },
        { id: 'shame', textKey: P + 'm02-door-4.shame', effects: [{ setFlag: 'story.m02.garrick', value: 'shamed' }], next: 'shamed' },
        { id: 'silent', textKey: P + 'm02-door-4.silent', effects: [{ setFlag: 'story.m02.garrick', value: 'silent' }], next: 'silent' },
      ],
    },
    { id: 'forgiven', speaker: 'garrick', textKey: P + 'forgiven', next: null },
    { id: 'shamed', speaker: 'garrick', textKey: P + 'shamed', next: null },
    { id: 'silent', speaker: 'garrick', textKey: P + 'silent', next: null },
    { id: 'after-forgiven', speaker: 'garrick', textKey: P + 'after-forgiven', next: null },
    { id: 'after', speaker: 'garrick', textKey: P + 'after', next: null },
    { id: 'idle', speaker: 'garrick', textKey: P + 'idle', next: null },
  ],
};
