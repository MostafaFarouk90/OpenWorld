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
    // the density pass: the report waits for what Cael overheard behind the screen
    { when: { all: [active('m08'), done('m08', 'screen'), stance('meek')] }, node: 'm08-report-meek' },
    { when: { all: [active('m08'), done('m08', 'screen'), stance('bold')] }, node: 'm08-report-bold' },
    { when: { all: [active('m08'), done('m08', 'screen')] }, node: 'm08-report-steady' },
    { when: { all: [active('m08'), done('m08', 'o3')] }, node: 'm08-screen-remind' },
    { when: { all: [active('m08'), done('m08', 'o2')] }, node: 'm08-hall-remind' },
    { when: { all: [active('m08'), done('m08', 'pass')] }, node: 'm08-go-remind' },
    { when: { all: [active('m08'), done('m08', 'fit')] }, node: 'm08-pass-remind' },
    { when: active('m08'), node: 'm08-fit-remind' },
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
    say('m08-brief', 'm08-brief-2'),
    say('m08-brief-2', 'm08-brief-3'),
    { id: 'm08-brief-3', speaker: 'cael', textKey: P + 'm08-brief-3', next: 'm08-brief-4' },
    say('m08-brief-4', 'm08-brief-5'),
    say('m08-brief-5'),
    say('m08-fit-remind'),
    say('m08-pass-remind'),
    say('m08-go-remind'),
    say('m08-hall-remind'),
    say('m08-screen-remind'),
    say('m08-report-meek', 'm08-heard'),
    say('m08-report-steady', 'm08-heard'),
    say('m08-report-bold', 'm08-heard'),
    { id: 'm08-heard', speaker: 'cael', textKey: P + 'm08-heard', next: 'm08-heard-2' },
    say('m08-heard-2', 'm08-heard-3'),
    say('m08-heard-3'),

    // idle lines; after M08 a closing line about the signet follows
    say('idle-cold', 'idle-signet'),
    say('idle-banked', 'idle-signet'),
    say('idle', 'idle-signet'),
    say('idle-signet', null, { when: { quest: 'm08', state: 'completed' } }),
  ],
};
