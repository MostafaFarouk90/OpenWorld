import type { Condition, DialogueDef } from '../../quests/types';

const P = 'dialogue.npc-stane.';
const r02Active: Condition = { quest: 'r02', state: 'active' };
const done = (o: string): Condition => ({ objective: ['r02', o], done: true });

const classOpen: Condition = { flag: 'story.m07.classOpen', equals: true };
const m07Seen: Condition = { any: [{ quest: 'm07', state: 'active' }, { quest: 'm07', state: 'completed' }] };

export const npcStane: DialogueDef = {
  id: 'npc-stane',
  start: [
    { when: { quest: 't03', state: 'active' }, node: 'wave' },
    { when: { all: [{ quest: 'm02', state: 'completed' }, { quest: 'r02', state: 'inactive' }] }, node: 'r02-offer' },
    { when: { all: [r02Active, done('o4')] }, node: 'r02-done' },
    { when: { all: [r02Active, done('o3')] }, node: 'r02-tip-guard' },
    { when: { all: [r02Active, done('o2')] }, node: 'r02-tip-parry' },
    { when: r02Active, node: 'r02-tip-open' },
    { when: classOpen, node: 'trainer-open' },
    { when: { all: [m07Seen, { not: classOpen }] }, node: 'trainer-closed' },
    { when: { quest: 'r02', state: 'completed' }, node: 'idle-after' },
    { when: { all: [] }, node: 'idle' },
  ],
  nodes: [
    { id: 'wave', speaker: 'stane', textKey: P + 'wave', next: 'wave2' },
    { id: 'wave2', speaker: 'stane', textKey: P + 'wave2', next: 'wave3' },
    { id: 'wave3', speaker: 'cael', textKey: P + 'wave3', next: null },

    { id: 'r02-offer', speaker: 'stane', textKey: P + 'r02-offer', next: 'r02-offer-2' },
    {
      id: 'r02-offer-2', speaker: 'stane', textKey: P + 'r02-offer-2',
      choices: [
        { id: 'accept', textKey: P + 'r02-offer-2.accept', effects: [{ startQuest: 'r02' }], next: 'r02-brief' },
        { id: 'later', textKey: P + 'r02-offer-2.later', next: 'r02-later' },
      ],
    },
    { id: 'r02-brief', speaker: 'stane', textKey: P + 'r02-brief', next: null },
    { id: 'r02-later', speaker: 'stane', textKey: P + 'r02-later', next: null },
    { id: 'r02-tip-open', speaker: 'stane', textKey: P + 'r02-tip-open', next: null },
    { id: 'r02-tip-parry', speaker: 'stane', textKey: P + 'r02-tip-parry', next: null },
    { id: 'r02-tip-guard', speaker: 'stane', textKey: P + 'r02-tip-guard', next: null },
    { id: 'r02-done', speaker: 'stane', textKey: P + 'r02-done', next: 'r02-done-2' },
    { id: 'r02-done-2', speaker: 'stane', textKey: P + 'r02-done-2', next: null },
    // class trainer (Halvard Bastion yard)
    { id: 'trainer-closed', speaker: 'stane', textKey: P + 'trainer-closed', next: null },
    { id: 'trainer-open', speaker: 'stane', textKey: P + 'trainer-open', next: 'trainer-open-2' },
    {
      id: 'trainer-open-2', speaker: 'stane', textKey: P + 'trainer-open-2',
      choices: [
        { id: 'train', textKey: P + 'trainer-open-2.train', effects: [{ event: 'classes.trainer.open', payload: { classId: 'warden' } }], next: null },
        { id: 'leave', textKey: P + 'trainer-open-2.leave', next: null },
      ],
    },
    { id: 'idle-after', speaker: 'stane', textKey: P + 'idle-after', next: null },

    { id: 'idle', speaker: 'stane', textKey: P + 'idle', next: null },
  ],
};
