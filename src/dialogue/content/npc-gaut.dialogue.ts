import type { Condition, DialogueDef } from '../../quests/types';

const P = 'dialogue.npc-gaut.';
const m01Active: Condition = { quest: 'm01', state: 'active' };
const notBriefed: Condition = { not: { flag: 'quest.m01.briefed', equals: true } };
const cold: Condition = { favour: 'halvard', band: 'cold' };
const bankedPlus: Condition = { favour: 'halvard', band: ['banked', 'stoked', 'hearthbound'] };
const m04Active: Condition = { quest: 'm04', state: 'active' };
const done = (o: string): Condition => ({ objective: ['m04', o], done: true });

export const npcGaut: DialogueDef = {
  id: 'npc-gaut',
  start: [
    {
      when: { all: [m01Active, { objective: ['m01', 'o1'], done: true }, { objective: ['m01', 'o2'], done: true }] },
      node: 'report',
    },
    { when: { all: [m01Active, notBriefed, cold] }, node: 'brief-cold' },
    { when: { all: [m01Active, notBriefed] }, node: 'brief-banked' },
    { when: m01Active, node: 'remind' },

    // M04 The Toll at Hollin Ford
    { when: { all: [{ quest: 'm03', state: 'completed' }, { quest: 'm04', state: 'inactive' }, cold] }, node: 'm04-offer-cold' },
    { when: { all: [{ quest: 'm03', state: 'completed' }, { quest: 'm04', state: 'inactive' }] }, node: 'm04-offer-banked' },
    { when: { all: [m04Active, done('o5'), cold] }, node: 'm04-report-cold' },
    { when: { all: [m04Active, done('o5')] }, node: 'm04-report-banked' },
    { when: { all: [m04Active, done('o4')] }, node: 'm04-carters' },
    { when: { all: [m04Active, done('o3')] }, node: 'm04-tollpost' },
    { when: { all: [m04Active, done('o2')] }, node: 'm04-spare-remind' },
    { when: { all: [m04Active, done('o1')] }, node: 'm04-spare' },
    { when: m04Active, node: 'm04-ford' },

    { when: cold, node: 'idle-cold' },
    { when: bankedPlus, node: 'idle-banked' },
    { when: { all: [] }, node: 'idle' },
  ],
  nodes: [
    // briefing (first visit while M01 is active)
    { id: 'brief-cold', speaker: 'gaut', textKey: P + 'brief-cold', next: 'brief-1' },
    { id: 'brief-banked', speaker: 'gaut', textKey: P + 'brief-banked', next: 'brief-1' },
    { id: 'brief-1', speaker: 'gaut', textKey: P + 'brief-1', next: 'brief-2' },
    {
      id: 'brief-2', speaker: 'gaut', textKey: P + 'brief-2',
      effects: [{ setFlag: 'quest.m01.briefed', value: true }],
      choices: [
        { id: 'ready', textKey: P + 'brief-2.ready', next: 'brief-end' },
        { id: 'where', textKey: P + 'brief-2.where', next: 'brief-where' },
      ],
    },
    { id: 'brief-where', speaker: 'gaut', textKey: P + 'brief-where', next: 'brief-2' },
    { id: 'brief-end', speaker: 'gaut', textKey: P + 'brief-end', next: null },

    { id: 'remind', speaker: 'gaut', textKey: P + 'remind', next: null },

    // report (the talk objective finishes M01 when this dialogue ends)
    { id: 'report', speaker: 'gaut', textKey: P + 'report', next: 'report-2' },
    { id: 'report-2', speaker: 'gaut', textKey: P + 'report-2', next: 'report-3' },
    { id: 'report-3', speaker: 'gaut', textKey: P + 'report-3', next: null },

    // ---- M04 offer ----
    { id: 'm04-offer-cold', speaker: 'gaut', textKey: P + 'm04-offer-cold', next: 'm04-offer-1' },
    { id: 'm04-offer-banked', speaker: 'gaut', textKey: P + 'm04-offer-banked', next: 'm04-offer-1' },
    { id: 'm04-offer-1', speaker: 'gaut', textKey: P + 'm04-offer-1', next: 'm04-offer-2' },
    {
      id: 'm04-offer-2', speaker: 'gaut', textKey: P + 'm04-offer-2',
      choices: [
        { id: 'accept', textKey: P + 'm04-offer-2.accept', effects: [{ startQuest: 'm04' }], next: 'm04-offer-end' },
        { id: 'more', textKey: P + 'm04-offer-2.more', next: 'm04-offer-more' },
      ],
    },
    { id: 'm04-offer-more', speaker: 'gaut', textKey: P + 'm04-offer-more', next: 'm04-offer-2' },
    { id: 'm04-offer-end', speaker: 'gaut', textKey: P + 'm04-offer-end', next: null },

    // ---- M04 in progress ----
    { id: 'm04-ford', speaker: 'gaut', textKey: P + 'm04-ford', next: null },
    // the Spare lesson (reachable only while o1 is done and o2 is not)
    { id: 'm04-spare', speaker: 'gaut', textKey: P + 'm04-spare', effects: [{ unlockMercy: 'spare' }], next: 'm04-spare-2' },
    { id: 'm04-spare-2', speaker: 'gaut', textKey: P + 'm04-spare-2', next: 'm04-spare-3' },
    { id: 'm04-spare-3', speaker: 'gaut', textKey: P + 'm04-spare-3', next: null },
    { id: 'm04-spare-remind', speaker: 'gaut', textKey: P + 'm04-spare-remind', next: null },
    { id: 'm04-tollpost', speaker: 'gaut', textKey: P + 'm04-tollpost', next: null },
    { id: 'm04-carters', speaker: 'gaut', textKey: P + 'm04-carters', next: null },

    // report (the talk objective finishes M04 when this dialogue ends; the quest rewards give the shield)
    { id: 'm04-report-cold', speaker: 'gaut', textKey: P + 'm04-report-cold', next: 'm04-report-2' },
    { id: 'm04-report-banked', speaker: 'gaut', textKey: P + 'm04-report-banked', next: 'm04-report-2' },
    { id: 'm04-report-2', speaker: 'gaut', textKey: P + 'm04-report-2', next: null },

    { id: 'idle-cold', speaker: 'gaut', textKey: P + 'idle-cold', next: null },
    { id: 'idle-banked', speaker: 'gaut', textKey: P + 'idle-banked', next: null },
    { id: 'idle', speaker: 'gaut', textKey: P + 'idle', next: null },
  ],
};
