import type { Condition, DialogueDef, DialogueNode } from '../../quests/types';

const P = 'dialogue.npc-wystan.';
const done = (q: string, o: string): Condition => ({ objective: [q, o], done: true });
const active = (q: string): Condition => ({ quest: q, state: 'active' });
const stance = (v: string): Condition => ({ flag: 'story.m08.stance', equals: v });

const say = (id: string, next: string | null = null, extra: Partial<DialogueNode> = {}): DialogueNode =>
  ({ id, speaker: 'wystan', textKey: P + id, next, ...extra });

export const npcWystan: DialogueDef = {
  id: 'npc-wystan',
  start: [
    { when: { all: [{ quest: 'm07', state: 'completed' }, { quest: 'm08', state: 'inactive' }] }, node: 'm08-offer' },
    { when: { all: [active('m08'), done('m08', 'o3'), stance('meek')] }, node: 'm08-report-meek' },
    { when: { all: [active('m08'), done('m08', 'o3'), stance('bold')] }, node: 'm08-report-bold' },
    { when: { all: [active('m08'), done('m08', 'o3')] }, node: 'm08-report-steady' },
    { when: { all: [active('m08'), done('m08', 'o2')] }, node: 'm08-hall-remind' },
    { when: active('m08'), node: 'm08-go-remind' },
    { when: { favour: 'halvard', band: 'cold' }, node: 'idle-cold' },
    { when: { favour: 'halvard', band: 'banked' }, node: 'idle-banked' },
    { when: { all: [] }, node: 'idle' },
  ],
  nodes: [
    say('m08-offer', 'm08-offer-2'),
    {
      id: 'm08-offer-2', speaker: 'wystan', textKey: P + 'm08-offer-2',
      choices: [
        { id: 'accept', textKey: P + 'm08-offer-2.accept', effects: [{ startQuest: 'm08' }, { completeObjective: ['m08', 'o1'] }], next: 'm08-brief' },
        { id: 'later', textKey: P + 'm08-offer-2.later', next: null },
      ],
    },
    say('m08-brief'),
    say('m08-go-remind'),
    say('m08-hall-remind'),
    say('m08-report-meek'),
    say('m08-report-steady'),
    say('m08-report-bold'),

    // idle lines; after M08 a closing line about the signet follows
    say('idle-cold', 'idle-signet'),
    say('idle-banked', 'idle-signet'),
    say('idle', 'idle-signet'),
    say('idle-signet', null, { when: { quest: 'm08', state: 'completed' } }),
  ],
};
