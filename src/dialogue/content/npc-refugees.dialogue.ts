import type { Condition, DialogueDef, DialogueNode } from '../../quests/types';

const m06Active: Condition = { quest: 'm06', state: 'active' };
const done = (o: string): Condition => ({ objective: ['m06', o], done: true });
const tested: Condition = { flag: 'story.m06.queueTested', equals: true };

const line = (P: string, speaker: string) => (id: string, next: string | null = null, extra: Partial<DialogueNode> = {}): DialogueNode =>
  ({ id, speaker, textKey: P + id, next, ...extra });

const H = 'dialogue.npc-refugee-1.';
const hild = line(H, 'refugee-1');
const cael1 = line(H, 'cael');

/**
 * The two gate refugees of M06 (density pass): Tilda, a charcoal-burner from Cinderreach whose kiln-black hands the
 * sergeant calls ash-touched, and Old Beorn, a forge-hand with a burn that still glows. Their stories are the queue
 * objective; once Rook has seen the brazier judge Cael, Tilda hears that it may judge them too (the word objective).
 */
export const npcRefugee1: DialogueDef = {
  id: 'npc-refugee-1',
  start: [
    { when: { all: [m06Active, done('proof'), { not: done('word') }] }, node: 'word' },
    { when: tested, node: 'inside' },
    { when: { all: [m06Active, { not: done('queue') }] }, node: 'story' },
    { when: { all: [] }, node: 'idle' },
  ],
  nodes: [
    hild('story', 'story-2'),
    hild('story-2', 'story-3'),
    cael1('story-3', 'story-4'),
    hild('story-4'),
    cael1('word', 'word-2'),
    hild('word-2', 'word-3'),
    hild('word-3', 'word-4'),
    line(H, 'refugee-2')('word-4', 'word-5'),
    cael1('word-5', 'word-6'),
    hild('word-6'),
    hild('inside'),
    hild('idle'),
  ],
};

const B = 'dialogue.npc-refugee-2.';
const beorn = line(B, 'refugee-2');
const cael2 = line(B, 'cael');

export const npcRefugee2: DialogueDef = {
  id: 'npc-refugee-2',
  start: [
    { when: tested, node: 'inside' },
    { when: { all: [m06Active, { not: done('queue') }] }, node: 'story' },
    { when: { all: [] }, node: 'idle' },
  ],
  nodes: [
    beorn('story', 'story-2'),
    beorn('story-2', 'story-3'),
    cael2('story-3', 'story-4'),
    beorn('story-4'),
    beorn('inside'),
    beorn('idle'),
  ],
};
