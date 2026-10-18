import type { Condition, DialogueDef } from '../../quests/types';

const P = 'dialogue.npc-aelfreda.';
const done = (q: string, o: string): Condition => ({ objective: [q, o], done: true });
const notDone = (q: string, o: string): Condition => ({ objective: [q, o], done: false });
const m03Active: Condition = { quest: 'm03', state: 'active' };
const d01Active: Condition = { quest: 'd01', state: 'active' };
const priorOutcome = (v: string): Condition => ({ flag: 'boss.ashen-prior.outcome', equals: v });

export const npcAelfreda: DialogueDef = {
  id: 'npc-aelfreda',
  start: [
    { when: { quest: 'm01', state: 'active' }, node: 'shard' },

    // M03 Cold Embers
    { when: { all: [{ quest: 'm02', state: 'completed' }, { quest: 'm03', state: 'inactive' }] }, node: 'm03-offer' },
    { when: { all: [m03Active, done('m03', 'o6')] }, node: 'm03-report' },
    { when: { all: [m03Active, done('m03', 'o5')] }, node: 'release-hint' },
    { when: { all: [m03Active, done('m03', 'o4')] }, node: 'burn' },
    { when: { all: [m03Active, done('m03', 'o3')] }, node: 'leap-remind' },
    { when: { all: [m03Active, done('m03', 'o2'), notDone('m03', 'o3')] }, node: 'leap' },
    { when: m03Active, node: 'm03-study' },

    // D01 Prayers in the Vault
    {
      when: { all: [{ quest: 'm03', state: 'completed' }, { quest: 'm05', state: 'completed' }, { quest: 'd01', state: 'inactive' }] },
      node: 'd01-offer',
    },
    { when: { all: [d01Active, done('d01', 'o3'), priorOutcome('released')] }, node: 'd01-released' },
    { when: { all: [d01Active, done('d01', 'o3'), priorOutcome('defeated')] }, node: 'd01-defeated' },
    { when: d01Active, node: 'd01-remind' },
    { when: { all: [{ quest: 'd01', state: 'completed' }, priorOutcome('released')] }, node: 'idle-released' },
    { when: { all: [{ quest: 'd01', state: 'completed' }, priorOutcome('defeated')] }, node: 'idle-defeated' },

    { when: { all: [] }, node: 'idle' },
  ],
  nodes: [
    { id: 'shard', speaker: 'aelfreda', textKey: P + 'shard', next: 'shard2' },
    { id: 'shard2', speaker: 'aelfreda', textKey: P + 'shard2', next: null },

    // ---- M03 ----
    { id: 'm03-offer', speaker: 'aelfreda', textKey: P + 'm03-offer', next: 'm03-offer-2' },
    {
      id: 'm03-offer-2', speaker: 'aelfreda', textKey: P + 'm03-offer-2',
      choices: [
        { id: 'accept', textKey: P + 'm03-offer-2.accept', effects: [{ startQuest: 'm03' }], next: 'm03-brief' },
        { id: 'later', textKey: P + 'm03-offer-2.later', next: 'm03-later' },
      ],
    },
    { id: 'm03-brief', speaker: 'aelfreda', textKey: P + 'm03-brief', next: null },
    { id: 'm03-later', speaker: 'aelfreda', textKey: P + 'm03-later', next: null },
    { id: 'm03-study', speaker: 'aelfreda', textKey: P + 'm03-study', next: null },

    // the Leap lesson: only reachable while o2 is done and o3 is not, so the grant runs once
    { id: 'leap', speaker: 'aelfreda', textKey: P + 'leap', effects: [{ grantAbility: 'surge-leap' }], next: 'leap-2' },
    { id: 'leap-2', speaker: 'aelfreda', textKey: P + 'leap-2', next: null },
    { id: 'leap-remind', speaker: 'aelfreda', textKey: P + 'leap-remind', next: null },

    // Burn and Scars, then the Release rite (finishing this talk credits o5)
    { id: 'burn', speaker: 'aelfreda', textKey: P + 'burn', next: 'burn-2' },
    { id: 'burn-2', speaker: 'aelfreda', textKey: P + 'burn-2', next: 'burn-3' },
    { id: 'burn-3', speaker: 'aelfreda', textKey: P + 'burn-3', next: 'release' },
    { id: 'release', speaker: 'aelfreda', textKey: P + 'release', effects: [{ unlockMercy: 'release' }], next: 'release-2' },
    { id: 'release-2', speaker: 'aelfreda', textKey: P + 'release-2', next: null },
    { id: 'release-hint', speaker: 'aelfreda', textKey: P + 'release-hint', next: null },

    { id: 'm03-report', speaker: 'aelfreda', textKey: P + 'm03-report', next: 'm03-report-2' },
    { id: 'm03-report-2', speaker: 'aelfreda', textKey: P + 'm03-report-2', next: null },

    // ---- D01 ----
    { id: 'd01-offer', speaker: 'aelfreda', textKey: P + 'd01-offer', next: 'd01-offer-2' },
    {
      id: 'd01-offer-2', speaker: 'aelfreda', textKey: P + 'd01-offer-2',
      choices: [
        { id: 'accept', textKey: P + 'd01-offer-2.accept', effects: [{ startQuest: 'd01' }], next: 'd01-brief' },
        { id: 'later', textKey: P + 'd01-offer-2.later', next: 'd01-later' },
      ],
    },
    { id: 'd01-brief', speaker: 'aelfreda', textKey: P + 'd01-brief', next: null },
    { id: 'd01-later', speaker: 'aelfreda', textKey: P + 'd01-later', next: null },
    { id: 'd01-remind', speaker: 'aelfreda', textKey: P + 'd01-remind', next: null },
    { id: 'd01-released', speaker: 'aelfreda', textKey: P + 'd01-released', next: 'd01-released-2' },
    { id: 'd01-released-2', speaker: 'aelfreda', textKey: P + 'd01-released-2', next: null },
    { id: 'd01-defeated', speaker: 'aelfreda', textKey: P + 'd01-defeated', next: 'd01-defeated-2' },
    { id: 'd01-defeated-2', speaker: 'aelfreda', textKey: P + 'd01-defeated-2', next: null },
    { id: 'idle-released', speaker: 'aelfreda', textKey: P + 'idle-released', next: null },
    { id: 'idle-defeated', speaker: 'aelfreda', textKey: P + 'idle-defeated', next: null },

    { id: 'idle', speaker: 'aelfreda', textKey: P + 'idle', next: null },
  ],
};
