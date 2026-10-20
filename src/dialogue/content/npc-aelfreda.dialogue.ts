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
    // M01: once the three are at the chapel door she has a word about them (credits m01 `rescued`)
    { when: { all: [{ quest: 'm01', state: 'active' }, done('m01', 'o2'), notDone('m01', 'rescued')] }, node: 'm01-rescued' },
    { when: { quest: 'm01', state: 'active' }, node: 'shard' },

    // M03 Cold Embers
    { when: { all: [{ quest: 'm02', state: 'completed' }, { quest: 'm03', state: 'inactive' }] }, node: 'm03-offer' },
    { when: { all: [m03Active, done('m03', 'o6')] }, node: 'm03-report' },
    { when: { all: [m03Active, done('m03', 'o5')] }, node: 'release-hint' },
    { when: { all: [m03Active, done('m03', 'grave')] }, node: 'burn' },
    { when: { all: [m03Active, done('m03', 'candle')] }, node: 'grave-send' },
    { when: { all: [m03Active, done('m03', 'o4')] }, node: 'candle-remind' },
    { when: { all: [m03Active, done('m03', 'o3')] }, node: 'leap-remind' },
    { when: { all: [m03Active, done('m03', 'study'), notDone('m03', 'o3')] }, node: 'leap' },
    { when: { all: [m03Active, done('m03', 'o2')] }, node: 'study-more' },
    { when: m03Active, node: 'm03-study' },

    // D01 Prayers in the Vault
    {
      when: { all: [{ quest: 'm03', state: 'completed' }, { quest: 'm05', state: 'completed' }, { quest: 'd01', state: 'inactive' }] },
      node: 'd01-offer',
    },
    { when: { all: [d01Active, done('d01', 'altar')] }, node: 'd01-vigil' },
    { when: { all: [d01Active, done('d01', 'o4')] }, node: 'd01-altar-remind' },
    { when: { all: [d01Active, done('d01', 'o3'), notDone('d01', 'censer')] }, node: 'd01-censer-remind' },
    { when: { all: [d01Active, done('d01', 'o3'), priorOutcome('released')] }, node: 'd01-released' },
    { when: { all: [d01Active, done('d01', 'o3'), priorOutcome('defeated')] }, node: 'd01-defeated' },
    { when: d01Active, node: 'd01-remind' },
    { when: { all: [{ quest: 'd01', state: 'completed' }, priorOutcome('released')] }, node: 'idle-released' },
    { when: { all: [{ quest: 'd01', state: 'completed' }, priorOutcome('defeated')] }, node: 'idle-defeated' },

    { when: { all: [] }, node: 'idle' },
  ],
  nodes: [
    { id: 'm01-rescued', speaker: 'aelfreda', textKey: P + 'm01-rescued', next: 'm01-rescued-2' },
    { id: 'm01-rescued-2', speaker: 'aelfreda', textKey: P + 'm01-rescued-2', next: 'm01-rescued-3' },
    { id: 'm01-rescued-3', speaker: 'cael', textKey: P + 'm01-rescued-3', next: 'm01-rescued-4' },
    { id: 'm01-rescued-4', speaker: 'aelfreda', textKey: P + 'm01-rescued-4', next: null },
    { id: 'shard', speaker: 'aelfreda', textKey: P + 'shard', next: 'shard2' },
    { id: 'shard2', speaker: 'aelfreda', textKey: P + 'shard2', next: null },

    // ---- M03 ----
    { id: 'm03-offer', speaker: 'aelfreda', textKey: P + 'm03-offer', next: 'm03-offer-2' },
    {
      id: 'm03-offer-2', speaker: 'aelfreda', textKey: P + 'm03-offer-2',
      choices: [
        { id: 'accept', textKey: P + 'm03-offer-2.accept', effects: [{ startQuest: 'm03' }], next: 'm03-ask' },
        { id: 'later', textKey: P + 'm03-offer-2.later', next: 'm03-later' },
      ],
    },
    // asked before the work starts; each answer comes back here
    {
      id: 'm03-ask', speaker: 'aelfreda', textKey: P + 'm03-ask',
      choices: [
        { id: 'keepers', textKey: P + 'm03-ask.keepers', next: 'm03-keepers' },
        { id: 'ulthred', textKey: P + 'm03-ask.ulthred', next: 'm03-ulthred' },
        { id: 'begin', textKey: P + 'm03-ask.begin', next: 'm03-brief' },
      ],
    },
    { id: 'm03-keepers', speaker: 'aelfreda', textKey: P + 'm03-keepers', next: 'm03-keepers-2' },
    { id: 'm03-keepers-2', speaker: 'aelfreda', textKey: P + 'm03-keepers-2', next: 'm03-ask' },
    { id: 'm03-ulthred', speaker: 'aelfreda', textKey: P + 'm03-ulthred', next: 'm03-ulthred-2' },
    { id: 'm03-ulthred-2', speaker: 'aelfreda', textKey: P + 'm03-ulthred-2', next: 'm03-ask' },
    { id: 'm03-brief', speaker: 'aelfreda', textKey: P + 'm03-brief', next: null },
    { id: 'm03-later', speaker: 'aelfreda', textKey: P + 'm03-later', next: null },
    { id: 'm03-study', speaker: 'aelfreda', textKey: P + 'm03-study', next: null },
    { id: 'study-more', speaker: 'aelfreda', textKey: P + 'study-more', next: 'study-more-2' },
    { id: 'study-more-2', speaker: 'aelfreda', textKey: P + 'study-more-2', next: null },

    // the Leap lesson: only reachable while o2 is done and o3 is not, so the grant runs once
    { id: 'leap', speaker: 'aelfreda', textKey: P + 'leap', effects: [{ grantAbility: 'surge-leap' }], next: 'leap-2' },
    { id: 'leap-2', speaker: 'aelfreda', textKey: P + 'leap-2', next: null },
    { id: 'leap-remind', speaker: 'aelfreda', textKey: P + 'leap-remind', next: null },
    { id: 'candle-remind', speaker: 'aelfreda', textKey: P + 'candle-remind', next: null },
    { id: 'grave-send', speaker: 'aelfreda', textKey: P + 'grave-send', next: 'grave-send-2' },
    { id: 'grave-send-2', speaker: 'aelfreda', textKey: P + 'grave-send-2', next: null },

    // Burn and Scars (after Wulfric's grave), the candle lit, then the Release rite (finishing this talk credits o5)
    { id: 'burn', speaker: 'aelfreda', textKey: P + 'burn', next: 'burn-2' },
    { id: 'burn-2', speaker: 'aelfreda', textKey: P + 'burn-2', next: 'burn-wulfric' },
    { id: 'burn-wulfric', speaker: 'aelfreda', textKey: P + 'burn-wulfric', next: 'burn-wulfric-2' },
    { id: 'burn-wulfric-2', speaker: 'aelfreda', textKey: P + 'burn-wulfric-2', next: 'burn-gloves' },
    { id: 'burn-gloves', speaker: 'cael', textKey: P + 'burn-gloves', next: 'burn-gloves-2' },
    { id: 'burn-gloves-2', speaker: 'aelfreda', textKey: P + 'burn-gloves-2', next: 'burn-3' },
    { id: 'burn-3', speaker: 'aelfreda', textKey: P + 'burn-3', next: 'burn-tell' },
    {
      id: 'burn-tell', speaker: 'aelfreda', textKey: P + 'burn-tell',
      choices: [
        { id: 'tell', textKey: P + 'burn-tell.tell', effects: [{ setFlag: 'story.m03.scarsTold', value: 'village' }], next: 'burn-told' },
        { id: 'keep', textKey: P + 'burn-tell.keep', effects: [{ setFlag: 'story.m03.scarsTold', value: 'kept' }], next: 'burn-kept' },
      ],
    },
    { id: 'burn-told', speaker: 'aelfreda', textKey: P + 'burn-told', next: 'candle-lit' },
    { id: 'burn-kept', speaker: 'aelfreda', textKey: P + 'burn-kept', next: 'candle-lit' },
    { id: 'candle-lit', speaker: 'aelfreda', textKey: P + 'candle-lit', effects: [{ take: [{ itemId: 'warding-candle', count: 1 }] }], next: 'release' },
    { id: 'release', speaker: 'aelfreda', textKey: P + 'release', effects: [{ unlockMercy: 'release' }], next: 'release-2' },
    { id: 'release-2', speaker: 'aelfreda', textKey: P + 'release-2', next: null },
    { id: 'release-hint', speaker: 'aelfreda', textKey: P + 'release-hint', next: null },

    { id: 'm03-report', speaker: 'aelfreda', textKey: P + 'm03-report', next: 'm03-report-ask' },
    {
      id: 'm03-report-ask', speaker: 'aelfreda', textKey: P + 'm03-report-ask',
      choices: [
        { id: 'warm', textKey: P + 'm03-report-ask.warm', effects: [{ setFlag: 'story.m03.firstRelease', value: 'warm' }], next: 'm03-report-warm' },
        { id: 'hungry', textKey: P + 'm03-report-ask.hungry', effects: [{ setFlag: 'story.m03.firstRelease', value: 'hungry' }], next: 'm03-report-hungry' },
        { id: 'quiet', textKey: P + 'm03-report-ask.quiet', effects: [{ setFlag: 'story.m03.firstRelease', value: 'quiet' }], next: 'm03-report-quiet' },
      ],
    },
    { id: 'm03-report-warm', speaker: 'aelfreda', textKey: P + 'm03-report-warm', next: 'm03-record' },
    { id: 'm03-report-hungry', speaker: 'aelfreda', textKey: P + 'm03-report-hungry', next: 'm03-record' },
    { id: 'm03-report-quiet', speaker: 'aelfreda', textKey: P + 'm03-report-quiet', next: 'm03-record' },
    // today's unfinished line in the Hearthkeepers' record (story.m03.record)
    {
      id: 'm03-record', speaker: 'aelfreda', textKey: P + 'm03-record',
      choices: [
        { id: 'cold', textKey: P + 'm03-record.cold', effects: [{ setFlag: 'story.m03.record', value: 'cold' }], next: 'm03-record-cold' },
        { id: 'warm', textKey: P + 'm03-record.warm', effects: [{ setFlag: 'story.m03.record', value: 'warm' }], next: 'm03-record-warm' },
        { id: 'blank', textKey: P + 'm03-record.blank', effects: [{ setFlag: 'story.m03.record', value: 'blank' }], next: 'm03-record-blank' },
      ],
    },
    { id: 'm03-record-cold', speaker: 'aelfreda', textKey: P + 'm03-record-cold', next: 'm03-report-gaut' },
    { id: 'm03-record-warm', speaker: 'aelfreda', textKey: P + 'm03-record-warm', next: 'm03-report-gaut' },
    { id: 'm03-record-blank', speaker: 'aelfreda', textKey: P + 'm03-record-blank', next: 'm03-report-gaut' },
    { id: 'm03-report-gaut', speaker: 'aelfreda', textKey: P + 'm03-report-gaut', next: 'm03-report-2' },
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
    // the briefing names the Prior (density pass, batch 2)
    { id: 'd01-brief', speaker: 'aelfreda', textKey: P + 'd01-brief', next: 'd01-brief-2' },
    { id: 'd01-brief-2', speaker: 'aelfreda', textKey: P + 'd01-brief-2', next: 'd01-brief-3' },
    { id: 'd01-brief-3', speaker: 'cael', textKey: P + 'd01-brief-3', next: 'd01-brief-4' },
    { id: 'd01-brief-4', speaker: 'aelfreda', textKey: P + 'd01-brief-4', next: 'd01-brief-5' },
    { id: 'd01-brief-5', speaker: 'aelfreda', textKey: P + 'd01-brief-5', next: 'd01-brief-6' },
    { id: 'd01-brief-6', speaker: 'aelfreda', textKey: P + 'd01-brief-6', next: null },
    { id: 'd01-later', speaker: 'aelfreda', textKey: P + 'd01-later', next: null },
    { id: 'd01-remind', speaker: 'aelfreda', textKey: P + 'd01-remind', next: null },
    { id: 'd01-released', speaker: 'aelfreda', textKey: P + 'd01-released', next: 'd01-released-2' },
    { id: 'd01-released-2', speaker: 'aelfreda', textKey: P + 'd01-released-2', next: 'd01-censer' },
    { id: 'd01-defeated', speaker: 'aelfreda', textKey: P + 'd01-defeated', next: 'd01-defeated-2' },
    { id: 'd01-defeated-2', speaker: 'aelfreda', textKey: P + 'd01-defeated-2', next: 'd01-censer' },
    // the censer goes on the altar (density pass, batch 2), then a short vigil there
    { id: 'd01-censer', speaker: 'aelfreda', textKey: P + 'd01-censer', next: 'd01-censer-2' },
    { id: 'd01-censer-2', speaker: 'aelfreda', textKey: P + 'd01-censer-2', next: null },
    { id: 'd01-censer-remind', speaker: 'aelfreda', textKey: P + 'd01-censer-remind', next: null },
    { id: 'd01-altar-remind', speaker: 'aelfreda', textKey: P + 'd01-altar-remind', next: null },
    { id: 'd01-vigil', speaker: 'aelfreda', textKey: P + 'd01-vigil', next: 'd01-vigil-2' },
    { id: 'd01-vigil-2', speaker: 'cael', textKey: P + 'd01-vigil-2', next: 'd01-vigil-3' },
    { id: 'd01-vigil-3', speaker: 'aelfreda', textKey: P + 'd01-vigil-3', next: 'd01-vigil-4' },
    { id: 'd01-vigil-4', speaker: 'aelfreda', textKey: P + 'd01-vigil-4', next: 'd01-vigil-5' },
    { id: 'd01-vigil-5', speaker: 'cael', textKey: P + 'd01-vigil-5', next: 'd01-record' },
    // what goes in the Hearthkeepers' record of him (story.d01.prior)
    {
      id: 'd01-record', speaker: 'aelfreda', textKey: P + 'd01-record',
      choices: [
        { id: 'name', textKey: P + 'd01-record.name', effects: [{ setFlag: 'story.d01.prior', value: 'name' }], next: 'd01-record-name' },
        { id: 'prayers', textKey: P + 'd01-record.prayers', effects: [{ setFlag: 'story.d01.prior', value: 'prayers' }], next: 'd01-record-prayers' },
        { id: 'silence', textKey: P + 'd01-record.silence', effects: [{ setFlag: 'story.d01.prior', value: 'silence' }], next: 'd01-record-silence' },
      ],
    },
    { id: 'd01-record-name', speaker: 'aelfreda', textKey: P + 'd01-record-name', next: 'd01-close' },
    { id: 'd01-record-prayers', speaker: 'aelfreda', textKey: P + 'd01-record-prayers', next: 'd01-close' },
    { id: 'd01-record-silence', speaker: 'aelfreda', textKey: P + 'd01-record-silence', next: 'd01-close' },
    { id: 'd01-close', speaker: 'aelfreda', textKey: P + 'd01-close', next: null },
    { id: 'idle-released', speaker: 'aelfreda', textKey: P + 'idle-released', next: null },
    { id: 'idle-defeated', speaker: 'aelfreda', textKey: P + 'idle-defeated', next: null },

    { id: 'idle', speaker: 'aelfreda', textKey: P + 'idle', next: null },
  ],
};
