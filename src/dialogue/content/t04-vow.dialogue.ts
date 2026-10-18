import type { Condition, DialogueChoice, DialogueDef, DialogueNode } from '../../quests/types';

const D = 'dialogue.t04-vow.';
const TONES = ['earnest', 'wry', 'humble'] as const;
type Tone = (typeof TONES)[number];

export const T04_DIALOGUE_ID = 't04-vow';

const asTone = (v: unknown): Tone => ((TONES as readonly unknown[]).includes(v) ? (v as Tone) : 'earnest');

/** Majority tone of the three vows; when all differ, vow 3 wins. Unknown values count as 'earnest'. */
export function computeVowTone(v1: unknown, v2: unknown, v3: unknown): Tone {
  const a = asTone(v1), b = asTone(v2), c = asTone(v3);
  if (a === b || a === c) return a;
  if (b === c) return b;
  return c;
}

const vowIs = (n: 1 | 2 | 3, t: Tone): Condition => ({ flag: `tutorial.t04.vow${n}`, equals: t });

/**
 * Tone t wins when at least two vows are t; when all three differ, vow 3's tone wins.
 * (vow3 = t and vow1, vow2 both something else but different from each other.)
 */
function toneWins(t: Tone): Condition {
  const [y, z] = TONES.filter((x) => x !== t);
  return {
    any: [
      { all: [vowIs(1, t), vowIs(2, t)] },
      { all: [vowIs(1, t), vowIs(3, t)] },
      { all: [vowIs(2, t), vowIs(3, t)] },
      { all: [vowIs(3, t), { any: [{ all: [vowIs(1, y), vowIs(2, z)] }, { all: [vowIs(1, z), vowIs(2, y)] }] }] },
    ],
  };
}

function vowNode(n: 1 | 2 | 3, next: string): DialogueNode {
  const choices: DialogueChoice[] = TONES.map((t) => ({
    id: t,
    textKey: `${D}vow${n}.${t}`,
    effects: [{ setFlag: `tutorial.t04.vow${n}`, value: t }],
    next,
  }));
  return { id: `vow${n}`, speaker: 'aelfreda', textKey: `${D}vow${n}`, choices };
}

export const t04Vow: DialogueDef = {
  id: T04_DIALOGUE_ID,
  start: 'entry',
  nodes: [
    {
      id: 'entry', speaker: 'aelfreda', textKey: `${D}entry`,
      effects: [
        { setFlag: 'tutorial.t04.vow1', value: 'earnest' },
        { setFlag: 'tutorial.t04.vow2', value: 'earnest' },
        { setFlag: 'tutorial.t04.vow3', value: 'earnest' },
        { setFlag: 'tutorial.t04.tone', value: 'earnest' },
      ],
      next: 'gaut-rite',
    },
    { id: 'gaut-rite', speaker: 'gaut', textKey: `${D}gaut-rite`, next: 'vow1' },
    vowNode(1, 'vow2'),
    vowNode(2, 'vow3'),
    vowNode(3, 'tone-earnest'),
    // Exactly one of these shows; the others are skipped by `when` and fall through to `lit`.
    {
      id: 'tone-earnest', speaker: 'aelfreda', textKey: `${D}tone-earnest`, when: toneWins('earnest'),
      effects: [{ setFlag: 'tutorial.t04.tone', value: 'earnest' }], next: 'tone-wry',
    },
    {
      id: 'tone-wry', speaker: 'aelfreda', textKey: `${D}tone-wry`, when: toneWins('wry'),
      effects: [{ setFlag: 'tutorial.t04.tone', value: 'wry' }], next: 'tone-humble',
    },
    {
      id: 'tone-humble', speaker: 'aelfreda', textKey: `${D}tone-humble`, when: toneWins('humble'),
      effects: [{ setFlag: 'tutorial.t04.tone', value: 'humble' }], next: 'lit',
    },
    {
      id: 'lit', speaker: 'aelfreda', textKey: `${D}lit`,
      effects: [{ event: 'tutorial.vow.complete' }], next: null,
    },
  ],
};
