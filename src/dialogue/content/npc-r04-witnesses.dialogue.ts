import type { Condition, DialogueDef, DialogueNode, Effect } from '../../quests/types';
import { R04_FENCE_GOLD } from '../../quests/content/gold';

const r04Active: Condition = { quest: 'r04', state: 'active' };
const done = (o: string): Condition => ({ objective: ['r04', o], done: true });
const choice = (v: string): Condition => ({ flag: 'story.r04.choice', equals: v });

const line = (P: string, speaker: string) => (id: string, next: string | null = null, extra: Partial<DialogueNode> = {}): DialogueNode =>
  ({ id, speaker, textKey: P + id, next, ...extra });

/** Hands over page `n`: the flag the objective's `doneWhen` reads, and the objective itself (in any order). */
const page = (n: 2 | 3): Effect[] => [
  { setFlag: `story.r04.page.${n}`, value: true },
  { completeObjective: ['r04', `page${n}`] },
];

const S = 'dialogue.npc-sexton.';
const elric = line(S, 'sexton');

/** R04 (density pass): the chapel sexton found the second page in the poor box and describes who left it. */
export const npcSexton: DialogueDef = {
  id: 'npc-sexton',
  start: [
    { when: { all: [r04Active, { not: done('page2') }] }, node: 'page' },
    { when: r04Active, node: 'after' },
    { when: { all: [] }, node: 'idle' },
  ],
  nodes: [
    elric('page', 'page-2'),
    elric('page-2', 'page-3'),
    line(S, 'cael')('page-3', 'page-4'),
    elric('page-4', null, { effects: page(2) }),
    elric('after'),
    elric('idle'),
  ],
};

const Q = 'dialogue.npc-fence.';
const quill = line(Q, 'fence');

/**
 * R04 (density pass): Mother Quill sells the third page for 20 gold, gives it to a friend of Gerta's (once Cael has met
 * her), or, to a Cael who cannot pay, for Whitlock's sake.
 */
export const npcFence: DialogueDef = {
  id: 'npc-fence',
  start: [
    { when: { all: [r04Active, { not: done('page3') }] }, node: 'offer' },
    { when: r04Active, node: 'after' },
    { when: { all: [] }, node: 'idle' },
  ],
  nodes: [
    quill('offer', 'offer-2'),
    {
      id: 'offer-2', speaker: 'fence', textKey: Q + 'offer-2',
      choices: [
        {
          id: 'pay', textKey: Q + 'offer-2.pay', when: { gold: { atLeast: R04_FENCE_GOLD } },
          effects: [{ spendGold: { amount: R04_FENCE_GOLD, reason: 'script' } }, { setFlag: 'story.r04.fence', value: 'paid' }, ...page(3)],
          next: 'paid',
        },
        // Gerta's name only once Cael has met her (M10); Whitlock's name when the purse is short, so the page is never
        // out of reach
        {
          id: 'gerta', textKey: Q + 'offer-2.gerta', when: { any: [{ quest: 'm10', state: 'active' }, { quest: 'm10', state: 'completed' }] },
          effects: [{ setFlag: 'story.r04.fence', value: 'gerta' }, ...page(3)], next: 'gerta',
        },
        {
          id: 'whitlock', textKey: Q + 'offer-2.whitlock', when: { not: { gold: { atLeast: R04_FENCE_GOLD } } },
          effects: [{ setFlag: 'story.r04.fence', value: 'whitlock' }, ...page(3)], next: 'whitlock',
        },
        { id: 'leave', textKey: Q + 'offer-2.leave', next: 'leave' },
      ],
    },
    quill('paid'),
    quill('gerta'),
    quill('whitlock'),
    quill('leave'),
    quill('after'),
    quill('idle'),
  ],
};

const C = 'dialogue.npc-crabbe.';
const crabbe = line(C, 'crabbe');

/** R04 (density pass): Steward Hereward Crabbe on the Counting-House steps owns up before Whitlock's choice. */
export const npcCrabbe: DialogueDef = {
  id: 'npc-crabbe',
  start: [
    { when: { all: [r04Active, done('o2'), { not: done('crabbe') }] }, node: 'confront' },
    { when: r04Active, node: 'wait' },
    { when: choice('expose'), node: 'exposed' },
    { when: choice('shield'), node: 'shielded' },
    { when: { all: [] }, node: 'idle' },
  ],
  nodes: [
    crabbe('confront', 'confront-2'),
    line(C, 'cael')('confront-2', 'confront-3'),
    crabbe('confront-3', 'confront-4'),
    crabbe('confront-4', 'confront-5'),
    crabbe('confront-5', 'confront-6'),
    crabbe('confront-6'),
    crabbe('wait'),
    crabbe('exposed'),
    crabbe('shielded'),
    crabbe('idle'),
  ],
};
