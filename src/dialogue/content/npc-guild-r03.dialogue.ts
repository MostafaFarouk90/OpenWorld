import type { Condition, DialogueDef, DialogueNode } from '../../quests/types';

const r03Active: Condition = { quest: 'r03', state: 'active' };
const done = (o: string): Condition => ({ objective: ['r03', o], done: true });
const price = (v: string): Condition => ({ flag: 'world.harrowmark.inn.price', equals: v });

const line = (P: string, speaker: string) => (id: string, next: string | null = null, extra: Partial<DialogueNode> = {}): DialogueNode =>
  ({ id, speaker, textKey: P + id, next, ...extra });

const D = 'dialogue.npc-guild-doorman.';
const leofric = line(D, 'guild-doorman');

/** R03 (density pass): Leofric keeps the Guildhall door and has a word before Pellam's thugs come out. */
export const npcGuildDoorman: DialogueDef = {
  id: 'npc-guild-doorman',
  start: [
    { when: { all: [r03Active, { not: done('doorman') }] }, node: 'word' },
    { when: r03Active, node: 'after' },
    { when: { all: [] }, node: 'idle' },
  ],
  nodes: [
    leofric('word', 'word-2'),
    line(D, 'cael')('word-2', 'word-3'),
    leofric('word-3', 'word-4'),
    leofric('word-4', 'word-5'),
    line(D, 'cael')('word-5'),
    leofric('after'),
    leofric('idle'),
  ],
};

const J = 'dialogue.npc-pellam.';
const jory = line(J, 'pellam');

/**
 * R03 (density pass): Jory Pellam, the Guild bookmaker who owes the Anvil. Once his thugs are down he pleads that the
 * debt was his dead brother Coll's; Cael promises to tell Aldith, or leaves him to (`story.r03.promise`), and Aldith
 * hears it before her choice.
 */
export const npcPellam: DialogueDef = {
  id: 'npc-pellam',
  start: [
    { when: { all: [r03Active, done('o2'), { not: done('pellam') }] }, node: 'plea' },
    { when: r03Active, node: 'after' },
    { when: price('forgiven'), node: 'forgiven' },
    { when: price('collected'), node: 'collected' },
    { when: { all: [] }, node: 'idle' },
  ],
  nodes: [
    jory('plea', 'plea-2'),
    jory('plea-2', 'plea-3'),
    jory('plea-3', 'plea-4'),
    {
      id: 'plea-4', speaker: 'pellam', textKey: J + 'plea-4',
      choices: [
        { id: 'speak', textKey: J + 'plea-4.speak', effects: [{ setFlag: 'story.r03.promise', value: 'speak' }], next: 'plea-end' },
        { id: 'nothing', textKey: J + 'plea-4.nothing', effects: [{ setFlag: 'story.r03.promise', value: 'nothing' }], next: 'plea-end' },
      ],
    },
    jory('plea-end'),
    jory('after'),
    jory('forgiven'),
    jory('collected'),
    jory('idle'),
  ],
};
