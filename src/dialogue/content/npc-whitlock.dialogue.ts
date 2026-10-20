import type { Condition, DialogueDef } from '../../quests/types';

const P = 'dialogue.npc-whitlock.';
const done = (q: string, o: string): Condition => ({ objective: [q, o], done: true });
const r04Active: Condition = { quest: 'r04', state: 'active' };

export const npcWhitlock: DialogueDef = {
  id: 'npc-whitlock',
  start: [
    // R04 The Archivist's Missing Pages
    { when: { all: [{ quest: 'm07', state: 'completed' }, { quest: 'r04', state: 'inactive' }] }, node: 'r04-offer' },
    // the density pass: Whitlock reads the three pages aloud once Crabbe has been asked about the steward's mark
    { when: { all: [r04Active, done('r04', 'crabbe')] }, node: 'r04-read-1' },
    { when: { all: [r04Active, done('r04', 'o2')] }, node: 'r04-crabbe-remind' },
    { when: r04Active, node: 'r04-remind' },

    { when: { all: [{ quest: 'r04', state: 'completed' }, { flag: 'story.r04.choice', equals: 'expose' }] }, node: 'idle-expose' },
    { when: { all: [{ quest: 'r04', state: 'completed' }, { flag: 'story.r04.choice', equals: 'shield' }] }, node: 'idle-shield' },
    { when: { all: [] }, node: 'idle' },
  ],
  nodes: [
    { id: 'r04-offer', speaker: 'whitlock', textKey: P + 'r04-offer', next: 'r04-offer-2' },
    {
      id: 'r04-offer-2', speaker: 'whitlock', textKey: P + 'r04-offer-2',
      choices: [
        {
          id: 'accept', textKey: P + 'r04-offer-2.accept',
          effects: [{ startQuest: 'r04' }, { completeObjective: ['r04', 'o1'] }],
          next: 'r04-brief',
        },
        { id: 'later', textKey: P + 'r04-offer-2.later', next: 'r04-later' },
      ],
    },
    { id: 'r04-brief', speaker: 'whitlock', textKey: P + 'r04-brief', next: 'r04-brief-2' },
    { id: 'r04-brief-2', speaker: 'whitlock', textKey: P + 'r04-brief-2', next: 'r04-brief-3' },
    { id: 'r04-brief-3', speaker: 'whitlock', textKey: P + 'r04-brief-3', next: null },
    { id: 'r04-later', speaker: 'whitlock', textKey: P + 'r04-later', next: null },
    { id: 'r04-remind', speaker: 'whitlock', textKey: P + 'r04-remind', next: null },
    { id: 'r04-crabbe-remind', speaker: 'whitlock', textKey: P + 'r04-crabbe-remind', next: null },
    ...['1', '1b', '2', '2b', '3', '3b'].map((k, i, all) => ({
      id: `r04-read-${k}`, speaker: 'whitlock', textKey: `${P}r04-read-${k}`, next: i + 1 < all.length ? `r04-read-${all[i + 1]}` : 'r04-pages',
    })),

    // The decision. Every choice decides (Esc aborts without crediting the talk objective), 'ask' loops back here.
    {
      id: 'r04-pages', speaker: 'whitlock', textKey: P + 'r04-pages',
      choices: [
        {
          id: 'expose', textKey: P + 'r04-pages.expose',
          effects: [
            { favour: 'halvard', delta: 5 },
            { favour: 'oswin', delta: -5 },
            { setFlag: 'story.r04.choice', value: 'expose' },
            { completeObjective: ['r04', 'o3'] },
          ],
          next: 'r04-expose-end',
        },
        {
          id: 'shield', textKey: P + 'r04-pages.shield',
          effects: [
            { favour: 'halvard', delta: -3 },
            { favour: 'oswin', delta: 5 },
            { setFlag: 'story.r04.choice', value: 'shield' },
            { completeObjective: ['r04', 'o3'] },
          ],
          next: 'r04-shield-end',
        },
        { id: 'ask', textKey: P + 'r04-pages.ask', next: 'r04-ask' },
      ],
    },
    { id: 'r04-ask', speaker: 'whitlock', textKey: P + 'r04-ask', next: 'r04-pages' },
    { id: 'r04-expose-end', speaker: 'whitlock', textKey: P + 'r04-expose-end', next: null },
    { id: 'r04-shield-end', speaker: 'whitlock', textKey: P + 'r04-shield-end', next: null },

    { id: 'idle-expose', speaker: 'whitlock', textKey: P + 'idle-expose', next: null },
    { id: 'idle-shield', speaker: 'whitlock', textKey: P + 'idle-shield', next: null },
    { id: 'idle', speaker: 'whitlock', textKey: P + 'idle', next: null },
  ],
};
