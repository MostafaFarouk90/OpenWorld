import type { Condition, DialogueDef, DialogueNode } from '../../quests/types';
import { R03_COIN_GOLD } from '../../quests/content/gold';

const P = 'dialogue.npc-aldith.';
const done = (q: string, o: string): Condition => ({ objective: [q, o], done: true });
const active = (q: string): Condition => ({ quest: q, state: 'active' });
const inactive = (q: string): Condition => ({ quest: q, state: 'inactive' });
const completed = (q: string): Condition => ({ quest: q, state: 'completed' });
const price = (v: string): Condition => ({ flag: 'world.harrowmark.inn.price', equals: v });

const say = (id: string, next: string | null = null, extra: Partial<DialogueNode> = {}): DialogueNode =>
  ({ id, speaker: 'aldith', textKey: P + id, next, ...extra });

export const npcAldith: DialogueDef = {
  id: 'npc-aldith',
  start: [
    // M07 The Tilted Anvil
    { when: { all: [active('m07'), done('m07', 'o4')] }, node: 'm07-bastion-remind' },
    { when: { all: [active('m07'), done('m07', 'o3')] }, node: 'm07-return' },
    { when: { all: [active('m07'), done('m07', 'o2')] }, node: 'm07-remind-satchel' },
    { when: active('m07'), node: 'm07-remind-thieves' },
    { when: { all: [completed('m06'), inactive('m07')] }, node: 'm07-offer' },

    // R03 The Brewer's Debt
    { when: { all: [active('r03'), done('r03', 'o3')] }, node: 'r03-settle' },
    { when: { all: [active('r03'), done('r03', 'o2')] }, node: 'r03-remind-copper' },
    { when: active('r03'), node: 'r03-remind-thugs' },
    { when: { all: [completed('m07'), inactive('r03')] }, node: 'r03-offer' },

    { when: price('forgiven'), node: 'idle-forgiven' },
    { when: price('collected'), node: 'idle-collected' },
    { when: { all: [] }, node: 'idle' },
  ],
  nodes: [
    // ---- M07 ----
    say('m07-offer', 'm07-offer-2'),
    {
      id: 'm07-offer-2', speaker: 'aldith', textKey: P + 'm07-offer-2',
      choices: [
        { id: 'accept', textKey: P + 'm07-offer-2.accept', effects: [{ startQuest: 'm07' }, { completeObjective: ['m07', 'o1'] }], next: 'm07-brief' },
        { id: 'later', textKey: P + 'm07-offer-2.later', next: null },
      ],
    },
    say('m07-brief'),
    say('m07-remind-thieves'),
    say('m07-remind-satchel'),
    say('m07-return', 'm07-return-2', {
      effects: [{
        if: { flag: 'story.m07.classOpen' }, then: [],
        else: [{ take: 'stolen-satchel' }, { setFlag: 'story.m07.classOpen', value: true }],
      }],
    }),
    say('m07-return-2'),
    say('m07-bastion-remind'),

    // ---- R03 ----
    say('r03-offer', 'r03-offer-2'),
    {
      id: 'r03-offer-2', speaker: 'aldith', textKey: P + 'r03-offer-2',
      choices: [
        { id: 'accept', textKey: P + 'r03-offer-2.accept', effects: [{ startQuest: 'r03' }, { completeObjective: ['r03', 'o1'] }], next: 'r03-brief' },
        { id: 'later', textKey: P + 'r03-offer-2.later', next: null },
      ],
    },
    say('r03-brief'),
    say('r03-remind-thugs'),
    say('r03-remind-copper'),
    {
      id: 'r03-settle', speaker: 'aldith', textKey: P + 'r03-settle',
      choices: [
        {
          id: 'forgive', textKey: P + 'r03-settle.forgive',
          effects: [{ take: 'brewing-copper' }, { setFlag: 'world.harrowmark.inn.price', value: 'forgiven' }], next: 'r03-forgive-end',
        },
        {
          id: 'collect', textKey: P + 'r03-settle.collect',
          effects: [{ take: 'brewing-copper' }, { setFlag: 'world.harrowmark.inn.price', value: 'collected' }, { giveGold: R03_COIN_GOLD }],
          next: 'r03-collect-end',
        },
      ],
    },
    say('r03-forgive-end'),
    say('r03-collect-end'),

    say('idle-forgiven'),
    say('idle-collected'),
    say('idle'),
  ],
};
