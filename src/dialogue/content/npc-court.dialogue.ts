import type { Condition, DialogueChoice, DialogueDef, DialogueNode } from '../../quests/types';
import { M09_CLERK_GOLD } from '../../quests/content/gold';

const m08Active: Condition = { quest: 'm08', state: 'active' };
const done = (o: string): Condition => ({ objective: ['m08', o], done: true });

const line = (P: string, speaker: string) => (id: string, next: string | null = null, extra: Partial<DialogueNode> = {}): DialogueNode =>
  ({ id, speaker, textKey: P + id, next, ...extra });

const A = 'dialogue.npc-armourer.';
const brand = line(A, 'armourer');

/** M08 (density pass): Armourer Brand fits Cael for court at the Bastion before the audience. */
export const npcArmourer: DialogueDef = {
  id: 'npc-armourer',
  start: [
    { when: { all: [m08Active, { not: done('fit') }] }, node: 'fit' },
    { when: { any: [m08Active, { quest: 'm08', state: 'completed' }] }, node: 'after' },
    { when: { all: [] }, node: 'idle' },
  ],
  nodes: [
    brand('fit', 'fit-2'),
    brand('fit-2', 'fit-3'),
    line(A, 'cael')('fit-3', 'fit-4'),
    brand('fit-4'),
    brand('after'),
    brand('idle'),
  ],
};

const G = 'dialogue.npc-keep-guard.';
const ordric = line(G, 'keep-guard');

/** M08 (density pass): the Keep warden looks at Rook's Watch Pass before the door opens (`story.m08.keepOpen`). */
export const npcKeepGuard: DialogueDef = {
  id: 'npc-keep-guard',
  start: [
    { when: { all: [m08Active, done('fit'), { not: done('pass') }] }, node: 'pass' },
    { when: { all: [m08Active, { not: done('pass') }] }, node: 'early' },
    { when: { any: [m08Active, { quest: 'm08', state: 'completed' }] }, node: 'after' },
    { when: { all: [] }, node: 'idle' },
  ],
  nodes: [
    ordric('pass', 'pass-2'),
    line(G, 'cael')('pass-2', 'pass-3'),
    ordric('pass-3'),
    ordric('early'),
    ordric('after'),
    ordric('idle'),
  ],
};

const L = 'dialogue.npc-grisel.';
const aldous = line(L, 'grisel');

/** M08 (density pass): Lord Aldous Grisel, down from Oldsmoke, waits his turn in the Keep hall (Act 2 meets him properly). */
export const npcGrisel: DialogueDef = {
  id: 'npc-grisel',
  start: [
    { when: { all: [m08Active, { not: done('o3') }] }, node: 'wait' },
    { when: { all: [] }, node: 'idle' },
  ],
  nodes: [
    aldous('wait', 'wait-2'),
    line(L, 'cael')('wait-2', 'wait-3'),
    aldous('wait-3'),
    aldous('idle'),
  ],
};

const m09Active: Condition = { quest: 'm09', state: 'active' };
const keyDone: Condition = { objective: ['m09', 'key'], done: true };
const C = 'dialogue.npc-clerk.';
const simeon = line(C, 'clerk');
const takeKey = (route: string): NonNullable<DialogueChoice['effects']> =>
  [{ setFlag: 'story.m09.keyRoute', value: route }, { completeObjective: ['m09', 'key'] }];

/**
 * M09 (density pass): Simeon Penhallow, Merrin's clerk, drinking on the Tilted Anvil's bench with the Counting-House side
 * door key in his satchel. A drink buys it, Merrin's name gets it from him once House Oswin trusts Cael (Banked or
 * better), or Cael lets him talk until he dozes off and lifts it from the satchel (the `use:m09-clerk-key` prop).
 */
export const npcClerk: DialogueDef = {
  id: 'npc-clerk',
  start: [
    // the key goes back once Cael is out clean: into his hand, or back into the satchel while he sleeps
    { when: { all: [m09Active, { objective: ['m09', 'o4'], done: true }, { flag: 'story.m09.keyRoute', equals: 'lifted' }] }, node: 'return-asleep' },
    { when: { all: [m09Active, { objective: ['m09', 'o4'], done: true }] }, node: 'return' },
    { when: { all: [m09Active, { not: keyDone }, { flag: 'story.m09.clerkDozing' }] }, node: 'dozing' },
    { when: { all: [m09Active, { not: keyDone }] }, node: 'meet' },
    { when: { any: [m09Active, { quest: 'm09', state: 'completed' }] }, node: 'after' },
    { when: { all: [] }, node: 'idle' },
  ],
  nodes: [
    simeon('meet', 'meet-2'),
    line(C, 'cael')('meet-2', 'meet-3'),
    simeon('meet-3', 'ask'),
    {
      id: 'ask', speaker: 'clerk', textKey: C + 'ask',
      choices: [
        {
          id: 'buy', textKey: C + 'ask.buy', when: { gold: { atLeast: M09_CLERK_GOLD } },
          effects: [{ spendGold: { amount: M09_CLERK_GOLD, reason: 'script' } }, ...takeKey('bought')], next: 'buy',
        },
        {
          id: 'name', textKey: C + 'ask.name', when: { favour: 'oswin', band: ['banked', 'stoked', 'hearthbound'] },
          effects: takeKey('merrin'), next: 'name',
        },
        { id: 'listen', textKey: C + 'ask.listen', next: 'listen' },
        { id: 'leave', textKey: C + 'ask.leave', next: null },
      ],
    },
    simeon('buy', 'buy-2'),
    simeon('buy-2'),
    simeon('name', 'name-2'),
    simeon('name-2'),
    simeon('listen', 'listen-2'),
    simeon('listen-2', 'listen-3'),
    line(C, 'cael')('listen-3', 'listen-4'),
    simeon('listen-4', 'listen-5'),
    { id: 'listen-5', speaker: 'cael', textKey: C + 'listen-5', next: null, effects: [{ setFlag: 'story.m09.clerkDozing', value: true }] },
    line(C, 'cael')('dozing'),
    simeon('return', 'return-2'),
    line(C, 'cael')('return-2', 'return-3'),
    simeon('return-3'),
    line(C, 'cael')('return-asleep', 'return-asleep-2'),
    simeon('return-asleep-2'),
    simeon('after'),
    simeon('idle'),
  ],
};

const m10Active: Condition = { quest: 'm10', state: 'active' };
const W = 'dialogue.npc-wace.';
const wace = line(W, 'wace');

/** M10 (density pass): Wace Carter, the stable-master by the South Gate, brings out the Ashmare for her first ride. */
export const npcWace: DialogueDef = {
  id: 'npc-wace',
  start: [
    { when: { all: [m10Active, { objective: ['m10', 'o4'], done: true }, { objective: ['m10', 'wace'], done: false }] }, node: 'meet' },
    { when: { all: [m10Active, { objective: ['m10', 'wace'], done: true }] }, node: 'ride-remind' },
    { when: { all: [] }, node: 'idle' },
  ],
  nodes: [
    wace('meet', 'meet-2'),
    line(W, 'cael')('meet-2', 'meet-3'),
    wace('meet-3', 'meet-4'),
    wace('meet-4', 'meet-5'),
    line(W, 'cael')('meet-5', 'meet-6'),
    wace('meet-6', 'meet-7'),
    line(W, 'cael')('meet-7', 'meet-8'),
    wace('meet-8'),
    wace('ride-remind'),
    wace('idle'),
  ],
};
