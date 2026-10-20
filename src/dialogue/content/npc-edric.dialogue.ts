import type { DialogueChoice, DialogueDef, DialogueNode } from '../../quests/types';

const P = 'dialogue.npc-edric.';

const node = (id: string, speaker: 'edric' | 'vey', next: string | null, extra: Partial<DialogueNode> = {}): DialogueNode =>
  ({ id, speaker, textKey: P + id, next, ...extra });

/** One question node with three answers, each leading to its own response node. */
const question = (q: string, nexts: [string, string, string], extra: (DialogueChoice['effects'])[]): DialogueNode => ({
  id: q, speaker: 'vey', textKey: P + q,
  choices: (['meek', 'honest', 'bold'] as const).map((kind, i) => ({
    id: kind, textKey: `${P}${q}.${kind}`, next: nexts[i],
    // applied once per question even if the audience is cut off and replayed
    effects: [{ if: { flag: `story.m08.audience.${q}` }, then: [], else: [...(extra[i] ?? []), { setFlag: `story.m08.audience.${q}`, value: true }] }],
  })),
});

const tone = (kind: 'meek' | 'honest' | 'bold'): DialogueChoice['effects'] =>
  kind === 'meek' ? [{ favour: 'halvard', delta: 2 }]
    : kind === 'bold' ? [{ favour: 'oswin', delta: 2 }, { favour: 'halvard', delta: -1 }]
      : [];

export const npcEdric: DialogueDef = {
  id: 'npc-edric',
  start: [
    {
      when: { all: [{ quest: 'm08', state: 'active' }, { objective: ['m08', 'o2'], done: true }, { objective: ['m08', 'o3'], done: false }] },
      node: 'aud-1',
    },
    { when: { not: { quest: 'm08', state: 'active' } }, node: 'idle-child' },
    { when: { all: [] }, node: 'idle' },
  ],
  nodes: [
    node('aud-1', 'edric', 'aud-2', { effects: [{ event: 'story.m08.audience.begin' }] }),
    node('aud-2', 'edric', 'q1'),

    question('q1', ['q1-meek', 'q1-honest', 'q1-bold'], [tone('meek'), tone('honest'), tone('bold')]),
    node('q1-meek', 'vey', 'q2'),
    node('q1-honest', 'edric', 'q2'),
    node('q1-bold', 'vey', 'q2'),

    question('q2', ['q2-meek', 'q2-honest', 'q2-bold'], [tone('meek'), tone('honest'), tone('bold')]),
    node('q2-meek', 'vey', 'q3'),
    node('q2-honest', 'vey', 'q3'),
    node('q2-bold', 'edric', 'q3'),

    question('q3', ['q3-meek', 'q3-honest', 'q3-bold'], [
      [...tone('meek')!, { setFlag: 'story.m08.stance', value: 'meek' }],
      [...tone('honest')!, { setFlag: 'story.m08.stance', value: 'steady' }],
      [...tone('bold')!, { setFlag: 'story.m08.stance', value: 'bold' }],
    ]),
    node('q3-meek', 'vey', 'edric-ask'),
    node('q3-honest', 'edric', 'edric-ask'),
    node('q3-bold', 'vey', 'edric-ask'),

    // the density pass: the boy's own question, after the Regent's (no favour; remembered as story.m08.edricAsked)
    node('edric-ask', 'edric', 'edric-ask-2'),
    {
      id: 'edric-ask-2', speaker: 'edric', textKey: P + 'edric-ask-2',
      choices: (['truth', 'brave', 'turn'] as const).map((id) => ({
        id, textKey: `${P}edric-ask-2.${id}`, next: `edric-answer-${id}`,
        effects: [{ setFlag: 'story.m08.edricAsked', value: id }],
      })),
    },
    node('edric-answer-truth', 'edric', 'aud-end'),
    node('edric-answer-brave', 'edric', 'aud-end'),
    node('edric-answer-turn', 'edric', 'aud-end'),
    node('aud-end', 'edric', 'aud-end-2'),
    node('aud-end-2', 'edric', null, { effects: [{ event: 'story.m08.audience.end' }] }),

    node('idle-child', 'edric', null),
    node('idle', 'edric', null),
  ],
};
