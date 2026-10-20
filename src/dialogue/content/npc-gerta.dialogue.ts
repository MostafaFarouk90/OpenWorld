import type { Condition, DialogueDef } from '../../quests/types';

const P = 'dialogue.npc-gerta.';
const done = (q: string, o: string): Condition => ({ objective: [q, o], done: true });
const m10Active: Condition = { quest: 'm10', state: 'active' };
const classOpen: Condition = { flag: 'story.m07.classOpen' };

export const npcGerta: DialogueDef = {
  id: 'npc-gerta',
  start: [
    // M10 Smoke Over the Rooftops
    { when: { all: [{ quest: 'm09', state: 'completed' }, { quest: 'm10', state: 'inactive' }] }, node: 'm10-offer' },
    // density pass: the orders, Vey's men, then Wace Carter and the first ride
    { when: { all: [m10Active, done('m10', 'o4')] }, node: 'm10-wace-remind' },
    { when: { all: [m10Active, done('m10', 'ambush')] }, node: 'm10-report' },
    { when: { all: [m10Active, done('m10', 'orders')] }, node: 'm10-ambush-remind' },
    { when: { all: [m10Active, done('m10', 'o3')] }, node: 'm10-orders-remind' },
    { when: { all: [m10Active, done('m10', 'o2')] }, node: 'm10-retry' },
    { when: m10Active, node: 'm10-go-again' },

    // Ashblade trainer talk
    {
      when: { all: [{ not: classOpen }, { quest: 'm07', state: ['active', 'completed'] }] },
      node: 'trainer-closed',
    },
    { when: classOpen, node: 'trainer-open' },

    { when: { all: [] }, node: 'idle' },
  ],
  nodes: [
    { id: 'm10-offer', speaker: 'gerta', textKey: P + 'm10-offer', next: 'm10-offer-2' },
    {
      id: 'm10-offer-2', speaker: 'gerta', textKey: P + 'm10-offer-2',
      choices: [
        {
          id: 'accept', textKey: P + 'm10-offer-2.accept',
          effects: [{ startQuest: 'm10' }, { completeObjective: ['m10', 'o1'] }],
          next: 'm10-brief',
        },
        { id: 'later', textKey: P + 'm10-offer-2.later', next: 'm10-later' },
      ],
    },
    { id: 'm10-later', speaker: 'gerta', textKey: P + 'm10-later', next: null },
    { id: 'm10-brief', speaker: 'gerta', textKey: P + 'm10-brief', next: 'm10-go' },
    { id: 'm10-go', speaker: 'gerta', textKey: P + 'm10-go', next: null },
    { id: 'm10-go-again', speaker: 'gerta', textKey: P + 'm10-go-again', next: null },
    { id: 'm10-retry', speaker: 'gerta', textKey: P + 'm10-retry', next: null },
    { id: 'm10-report', speaker: 'gerta', textKey: P + 'm10-report', next: 'm10-report-2' },
    { id: 'm10-report-2', speaker: 'gerta', textKey: P + 'm10-report-2', next: 'm10-read' },
    // density pass: what the orders say, as much as Gerta tells
    { id: 'm10-read', speaker: 'cael', textKey: P + 'm10-read', next: 'm10-read-2' },
    { id: 'm10-read-2', speaker: 'gerta', textKey: P + 'm10-read-2', next: 'm10-read-3' },
    { id: 'm10-read-3', speaker: 'cael', textKey: P + 'm10-read-3', next: 'm10-read-4' },
    { id: 'm10-read-4', speaker: 'gerta', textKey: P + 'm10-read-4', next: 'm10-report-3' },
    // the Ashmare is Cael's from here: she stands in the stables yard by the South Gate, where Wace Carter keeps her
    {
      id: 'm10-report-3', speaker: 'gerta', textKey: P + 'm10-report-3', next: null,
      effects: [{ setFlag: 'story.m10.ashmare', value: true }],
    },
    { id: 'm10-orders-remind', speaker: 'gerta', textKey: P + 'm10-orders-remind', next: null },
    { id: 'm10-ambush-remind', speaker: 'gerta', textKey: P + 'm10-ambush-remind', next: null },
    { id: 'm10-wace-remind', speaker: 'gerta', textKey: P + 'm10-wace-remind', next: null },

    { id: 'trainer-closed', speaker: 'gerta', textKey: P + 'trainer-closed', next: null },
    { id: 'trainer-open', speaker: 'gerta', textKey: P + 'trainer-open', next: 'trainer-open-2' },
    {
      id: 'trainer-open-2', speaker: 'gerta', textKey: P + 'trainer-open-2',
      choices: [
        { id: 'train', textKey: P + 'trainer-open-2.train', effects: [{ event: 'classes.trainer.open', payload: { classId: 'ashblade' } }], next: null },
        { id: 'leave', textKey: P + 'trainer-open-2.leave', next: null },
      ],
    },

    // After M10 the idle line mentions the courier (the variant node is chained so only the idle entry is needed)
    { id: 'idle', speaker: 'gerta', textKey: P + 'idle', next: 'idle-courier' },
    { id: 'idle-courier', speaker: 'gerta', textKey: P + 'idle-courier', when: { quest: 'm10', state: 'completed' }, next: null },
  ],
};
