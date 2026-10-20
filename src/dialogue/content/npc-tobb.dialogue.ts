import type { Condition, DialogueDef } from '../../quests/types';

const P = 'dialogue.npc-tobb.';
const m05Active: Condition = { quest: 'm05', state: 'active' };

export const npcTobb: DialogueDef = {
  id: 'npc-tobb',
  start: [
    // M01: Cael douses the Grey Goose door and Tobb steps out (credits m01 `tobb`); a second meeting from then on
    {
      when: { all: [{ quest: 'm01', state: 'active' }, { objective: ['m01', 'tavern'], done: true }, { objective: ['m01', 'tobb'], done: false }] },
      node: 'm01-meet',
    },
    { when: { all: [{ quest: 'm01', state: 'active' }, { objective: ['m01', 'tobb'], done: true }] }, node: 'm01-after' },
    { when: { all: [{ quest: 'm04', state: 'completed' }, { quest: 'm05', state: 'inactive' }] }, node: 'intro' },
    { when: { all: [m05Active, { objective: ['m05', 'o1'], done: true }, { objective: ['m05', 'o2'], done: true }] }, node: 'done' },
    { when: m05Active, node: 'remind' },
    { when: { all: [{ quest: 'm05', state: 'completed' }, { quest: 'd01', state: 'completed' }] }, node: 'banter-prior' },
    { when: { quest: 'm05', state: 'completed' }, node: 'banter' },
    { when: { quest: 'm01', state: 'completed' }, node: 'idle-met' },
    { when: { all: [] }, node: 'idle' },
  ],
  nodes: [
    { id: 'm01-meet', speaker: 'tobb', textKey: P + 'm01-meet', next: 'm01-meet-2' },
    { id: 'm01-meet-2', speaker: 'tobb', textKey: P + 'm01-meet-2', next: 'm01-meet-3' },
    { id: 'm01-meet-3', speaker: 'tobb', textKey: P + 'm01-meet-3', next: 'm01-meet-4' },
    { id: 'm01-meet-4', speaker: 'cael', textKey: P + 'm01-meet-4', next: 'm01-meet-5' },
    { id: 'm01-meet-5', speaker: 'tobb', textKey: P + 'm01-meet-5', next: 'm01-meet-6' },
    { id: 'm01-meet-6', speaker: 'tobb', textKey: P + 'm01-meet-6', next: null },
    { id: 'm01-after', speaker: 'tobb', textKey: P + 'm01-after', next: null },
    { id: 'idle-met', speaker: 'tobb', textKey: P + 'idle-met', next: null },
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
    // the bond scene at the lit shrine (density pass, batch 2): story.m05.ballad, then story.m05.tobbBond
    { id: 'done', speaker: 'tobb', textKey: P + 'done', next: 'bond-1' },
    { id: 'bond-1', speaker: 'tobb', textKey: P + 'bond-1', next: 'bond-2' },
    { id: 'bond-2', speaker: 'tobb', textKey: P + 'bond-2', next: 'bond-3' },
    { id: 'bond-3', speaker: 'cael', textKey: P + 'bond-3', next: 'bond-4' },
    { id: 'bond-4', speaker: 'tobb', textKey: P + 'bond-4', next: 'bond-5' },
    {
      id: 'bond-5', speaker: 'tobb', textKey: P + 'bond-5',
      choices: [
        { id: 'plain', textKey: P + 'bond-5.plain', effects: [{ setFlag: 'story.m05.ballad', value: 'plain' }], next: 'bond-plain' },
        { id: 'grand', textKey: P + 'bond-5.grand', effects: [{ setFlag: 'story.m05.ballad', value: 'grand' }], next: 'bond-grand' },
        { id: 'names', textKey: P + 'bond-5.names', effects: [{ setFlag: 'story.m05.ballad', value: 'names' }], next: 'bond-names' },
      ],
    },
    { id: 'bond-plain', speaker: 'tobb', textKey: P + 'bond-plain', next: 'bond-6' },
    { id: 'bond-grand', speaker: 'tobb', textKey: P + 'bond-grand', next: 'bond-6' },
    { id: 'bond-names', speaker: 'tobb', textKey: P + 'bond-names', next: 'bond-6' },
    { id: 'bond-6', speaker: 'tobb', textKey: P + 'bond-6', effects: [{ setFlag: 'story.m05.tobbBond', value: true }], next: 'done-2' },
    { id: 'done-2', speaker: 'tobb', textKey: P + 'done-2', next: null },
    { id: 'banter', speaker: 'tobb', textKey: P + 'banter', next: null },
    { id: 'banter-prior', speaker: 'tobb', textKey: P + 'banter-prior', next: null },
    { id: 'idle', speaker: 'tobb', textKey: P + 'idle', next: null },
  ],
};
