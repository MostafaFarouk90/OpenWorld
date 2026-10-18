import type { Condition, DialogueDef } from '../../quests/types';

const m01Active: Condition = { quest: 'm01', state: 'active' };
const notBriefed: Condition = { not: { flag: 'quest.m01.briefed', equals: true } };
const cold: Condition = { favour: 'halvard', band: 'cold' };
const warmPlus: Condition = { favour: 'halvard', band: ['warm', 'sworn', 'hearthsworn'] };

export const npcGaut: DialogueDef = {
  id: 'npc-gaut',
  start: [
    {
      when: { all: [m01Active, { objective: ['m01', 'o1'], done: true }, { objective: ['m01', 'o2'], done: true }] },
      node: 'report',
    },
    { when: { all: [m01Active, notBriefed, cold] }, node: 'brief-cold' },
    { when: { all: [m01Active, notBriefed] }, node: 'brief-warm' },
    { when: m01Active, node: 'remind' },
    { when: cold, node: 'idle-cold' },
    { when: warmPlus, node: 'idle-warm' },
    { when: { all: [] }, node: 'idle' },
  ],
  nodes: [
    // briefing (first visit while M01 is active)
    { id: 'brief-cold', speaker: 'gaut', textKey: 'dialogue.npc-gaut.brief-cold', next: 'brief-1' },
    { id: 'brief-warm', speaker: 'gaut', textKey: 'dialogue.npc-gaut.brief-warm', next: 'brief-1' },
    { id: 'brief-1', speaker: 'gaut', textKey: 'dialogue.npc-gaut.brief-1', next: 'brief-2' },
    {
      id: 'brief-2', speaker: 'gaut', textKey: 'dialogue.npc-gaut.brief-2',
      effects: [{ setFlag: 'quest.m01.briefed', value: true }],
      choices: [
        { id: 'ready', textKey: 'dialogue.npc-gaut.brief-2.ready', next: 'brief-end' },
        { id: 'where', textKey: 'dialogue.npc-gaut.brief-2.where', next: 'brief-where' },
      ],
    },
    { id: 'brief-where', speaker: 'gaut', textKey: 'dialogue.npc-gaut.brief-where', next: 'brief-2' },
    { id: 'brief-end', speaker: 'gaut', textKey: 'dialogue.npc-gaut.brief-end', next: null },

    { id: 'remind', speaker: 'gaut', textKey: 'dialogue.npc-gaut.remind', next: null },

    // report (the talk objective finishes M01 when this dialogue ends)
    { id: 'report', speaker: 'gaut', textKey: 'dialogue.npc-gaut.report', next: 'report-2' },
    { id: 'report-2', speaker: 'gaut', textKey: 'dialogue.npc-gaut.report-2', next: 'report-3' },
    { id: 'report-3', speaker: 'gaut', textKey: 'dialogue.npc-gaut.report-3', next: null },

    { id: 'idle-cold', speaker: 'gaut', textKey: 'dialogue.npc-gaut.idle-cold', next: null },
    { id: 'idle-warm', speaker: 'gaut', textKey: 'dialogue.npc-gaut.idle-warm', next: null },
    { id: 'idle', speaker: 'gaut', textKey: 'dialogue.npc-gaut.idle', next: null },
  ],
};
