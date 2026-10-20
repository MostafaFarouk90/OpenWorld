import type { Condition, DialogueDef } from '../../quests/types';

const P = 'dialogue.npc-gaut.';
const m01Active: Condition = { quest: 'm01', state: 'active' };
const notBriefed: Condition = { not: { flag: 'quest.m01.briefed', equals: true } };
const cold: Condition = { favour: 'halvard', band: 'cold' };
const bankedPlus: Condition = { favour: 'halvard', band: ['banked', 'stoked', 'hearthbound'] };
const m04Active: Condition = { quest: 'm04', state: 'active' };
const done = (o: string): Condition => ({ objective: ['m04', o], done: true });

const classOpen: Condition = { flag: 'story.m07.classOpen', equals: true };
const m07Seen: Condition = { any: [{ quest: 'm07', state: 'active' }, { quest: 'm07', state: 'completed' }] };

/** A migrated save can leave a marker quest active after the run ended; Gaut must not repeat it then. */
const inTutorial = { not: { flag: 'tutorial.complete', equals: true } } as const;

export const npcGaut: DialogueDef = {
  id: 'npc-gaut',
  start: [
    // Knighting Day: while a tutorial beat is active, Gaut repeats its goal (these come before the M01 briefing,
    // which is already active during T13 to T15).
    { when: { all: [{ quest: 't01', state: 'active' }, inTutorial] }, node: 'tut-t01' },
    { when: { all: [{ quest: 't02', state: 'active' }, inTutorial] }, node: 'tut-t02' },
    { when: { all: [{ quest: 't03', state: 'active' }, inTutorial] }, node: 'tut-t03' },
    { when: { all: [{ quest: 't04', state: 'active' }, inTutorial] }, node: 'tut-t04' },
    { when: { all: [{ quest: 't05', state: 'active' }, inTutorial] }, node: 'tut-t05' },
    { when: { all: [{ quest: 't06', state: 'active' }, inTutorial] }, node: 'tut-t06' },
    { when: { all: [{ quest: 't07', state: 'active' }, inTutorial] }, node: 'tut-t07' },
    { when: { all: [{ quest: 't08', state: 'active' }, inTutorial] }, node: 'tut-t08' },
    { when: { all: [{ quest: 't09', state: 'active' }, inTutorial] }, node: 'tut-t09' },
    { when: { all: [{ quest: 't10', state: 'active' }, inTutorial] }, node: 'tut-t10' },
    { when: { all: [{ quest: 't11', state: 'active' }, inTutorial] }, node: 'tut-t11' },
    { when: { all: [{ quest: 't12', state: 'active' }, inTutorial] }, node: 'tut-t12' },
    { when: { all: [{ quest: 't13', state: 'active' }, inTutorial] }, node: 'tut-t13' },
    { when: { all: [{ quest: 't14', state: 'active' }, inTutorial] }, node: 'tut-t14' },
    { when: { all: [{ quest: 't15', state: 'active' }, inTutorial] }, node: 'tut-t15' },
    { when: { all: [{ quest: 't-skirmish', state: 'active' }, inTutorial] }, node: 'tut-t-skirmish' },

    {
      when: { all: [m01Active, ...['o1', 'o2', 'tobb', 'miller', 'rescued'].map((o): Condition => ({ objective: ['m01', o], done: true }))] },
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
    { when: { all: [m04Active, done('shown')] }, node: 'm04-carters' },
    { when: { all: [m04Active, done('ledger')] }, node: 'm04-ledger-read' },
    { when: { all: [m04Active, done('o4')] }, node: 'm04-ledger' },
    { when: { all: [m04Active, done('sergeant')] }, node: 'm04-tollpost' },
    { when: { all: [m04Active, done('o3')] }, node: 'm04-sergeant' },
    { when: { all: [m04Active, done('o2')] }, node: 'm04-spare-remind' },
    { when: { all: [m04Active, done('o1')] }, node: 'm04-spare' },
    { when: m04Active, node: 'm04-ford' },

    // M06 Rook's gate
    { when: { quest: 'm06', state: 'active' }, node: 'm06-gate-wait' },
    { when: classOpen, node: 'trainer-open' },
    { when: { all: [m07Seen, { not: classOpen }] }, node: 'trainer-closed' },

    { when: cold, node: 'idle-cold' },
    { when: bankedPlus, node: 'idle-banked' },
    { when: { all: [] }, node: 'idle' },
  ],
  nodes: [
    // tutorial beats
    { id: 'tut-t01', speaker: 'gaut', textKey: P + 'tut-t01', next: null },
    { id: 'tut-t02', speaker: 'gaut', textKey: P + 'tut-t02', next: null },
    { id: 'tut-t03', speaker: 'gaut', textKey: P + 'tut-t03', next: null },
    { id: 'tut-t04', speaker: 'gaut', textKey: P + 'tut-t04', next: null },
    { id: 'tut-t05', speaker: 'gaut', textKey: P + 'tut-t05', next: null },
    { id: 'tut-t06', speaker: 'gaut', textKey: P + 'tut-t06', next: null },
    { id: 'tut-t07', speaker: 'gaut', textKey: P + 'tut-t07', next: null },
    { id: 'tut-t08', speaker: 'gaut', textKey: P + 'tut-t08', next: null },
    { id: 'tut-t09', speaker: 'gaut', textKey: P + 'tut-t09', next: null },
    { id: 'tut-t10', speaker: 'gaut', textKey: P + 'tut-t10', next: null },
    { id: 'tut-t11', speaker: 'gaut', textKey: P + 'tut-t11', next: null },
    { id: 'tut-t12', speaker: 'gaut', textKey: P + 'tut-t12', next: null },
    { id: 'tut-t13', speaker: 'gaut', textKey: P + 'tut-t13', next: null },
    { id: 'tut-t14', speaker: 'gaut', textKey: P + 'tut-t14', next: null },
    { id: 'tut-t15', speaker: 'gaut', textKey: P + 'tut-t15', next: null },
    { id: 'tut-t-skirmish', speaker: 'gaut', textKey: P + 'tut-t-skirmish', next: null },

    // briefing (first visit while M01 is active)
    { id: 'brief-cold', speaker: 'gaut', textKey: P + 'brief-cold', next: 'brief-1' },
    { id: 'brief-banked', speaker: 'gaut', textKey: P + 'brief-banked', next: 'brief-1' },
    { id: 'brief-1', speaker: 'gaut', textKey: P + 'brief-1', next: 'brief-goose' },
    { id: 'brief-goose', speaker: 'gaut', textKey: P + 'brief-goose', next: 'brief-mill' },
    { id: 'brief-mill', speaker: 'gaut', textKey: P + 'brief-mill', next: 'brief-2' },
    {
      id: 'brief-2', speaker: 'gaut', textKey: P + 'brief-2',
      effects: [{ setFlag: 'quest.m01.briefed', value: true }],
      choices: [
        { id: 'ready', textKey: P + 'brief-2.ready', next: 'brief-end' },
        { id: 'where', textKey: P + 'brief-2.where', next: 'brief-where' },
        { id: 'crack', textKey: P + 'brief-2.crack', next: 'brief-crack' },
      ],
    },
    { id: 'brief-crack', speaker: 'gaut', textKey: P + 'brief-crack', next: 'brief-crack-2' },
    { id: 'brief-crack-2', speaker: 'gaut', textKey: P + 'brief-crack-2', next: 'brief-2' },
    { id: 'brief-where', speaker: 'gaut', textKey: P + 'brief-where', next: 'brief-2' },
    { id: 'brief-end', speaker: 'gaut', textKey: P + 'brief-end', next: null },

    { id: 'remind', speaker: 'gaut', textKey: P + 'remind', next: null },

    // report (the talk objective finishes M01 when this dialogue ends)
    { id: 'report', speaker: 'gaut', textKey: P + 'report', next: 'report-2' },
    { id: 'report-2', speaker: 'gaut', textKey: P + 'report-2', next: 'report-tobb' },
    { id: 'report-tobb', speaker: 'gaut', textKey: P + 'report-tobb', next: 'report-3' },
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
    { id: 'm04-spare-2', speaker: 'gaut', textKey: P + 'm04-spare-2', next: 'm04-spare-why' },
    { id: 'm04-spare-why', speaker: 'gaut', textKey: P + 'm04-spare-why', next: 'm04-spare-ask' },
    {
      id: 'm04-spare-ask', speaker: 'gaut', textKey: P + 'm04-spare-ask',
      choices: [
        { id: 'enemy', textKey: P + 'm04-spare-ask.enemy', next: 'm04-spare-enemy' },
        { id: 'post', textKey: P + 'm04-spare-ask.post', next: 'm04-spare-post' },
        { id: 'go', textKey: P + 'm04-spare-ask.go', next: 'm04-spare-3' },
      ],
    },
    { id: 'm04-spare-enemy', speaker: 'gaut', textKey: P + 'm04-spare-enemy', next: 'm04-spare-ask' },
    { id: 'm04-spare-post', speaker: 'gaut', textKey: P + 'm04-spare-post', next: 'm04-spare-ask' },
    { id: 'm04-spare-3', speaker: 'gaut', textKey: P + 'm04-spare-3', next: null },
    { id: 'm04-spare-remind', speaker: 'gaut', textKey: P + 'm04-spare-remind', next: null },
    { id: 'm04-sergeant', speaker: 'gaut', textKey: P + 'm04-sergeant', next: null },
    { id: 'm04-tollpost', speaker: 'gaut', textKey: P + 'm04-tollpost', next: null },
    { id: 'm04-ledger', speaker: 'gaut', textKey: P + 'm04-ledger', next: null },
    { id: 'm04-carters', speaker: 'gaut', textKey: P + 'm04-carters', next: null },
    // the ledger read together: the Crucible (seeds M09 and Act 2), and who carries it
    { id: 'm04-ledger-read', speaker: 'gaut', textKey: P + 'm04-ledger-read', next: 'm04-ledger-read-2' },
    { id: 'm04-ledger-read-2', speaker: 'cael', textKey: P + 'm04-ledger-read-2', next: 'm04-ledger-read-3' },
    { id: 'm04-ledger-read-3', speaker: 'gaut', textKey: P + 'm04-ledger-read-3', next: 'm04-ledger-keep' },
    {
      id: 'm04-ledger-keep', speaker: 'gaut', textKey: P + 'm04-ledger-keep',
      choices: [
        { id: 'gaut', textKey: P + 'm04-ledger-keep.gaut', effects: [{ setFlag: 'story.m04.ledger', value: 'gaut' }], next: 'm04-ledger-gaut' },
        { id: 'cael', textKey: P + 'm04-ledger-keep.cael', effects: [{ setFlag: 'story.m04.ledger', value: 'cael' }], next: 'm04-ledger-cael' },
      ],
    },
    { id: 'm04-ledger-gaut', speaker: 'gaut', textKey: P + 'm04-ledger-gaut', next: 'm04-carters' },
    { id: 'm04-ledger-cael', speaker: 'gaut', textKey: P + 'm04-ledger-cael', next: 'm04-carters' },

    // report (the talk objective finishes M04 when this dialogue ends; the quest rewards give the shield)
    { id: 'm04-report-cold', speaker: 'gaut', textKey: P + 'm04-report-cold', next: 'm04-report-2' },
    { id: 'm04-report-banked', speaker: 'gaut', textKey: P + 'm04-report-banked', next: 'm04-report-2' },
    { id: 'm04-report-2', speaker: 'gaut', textKey: P + 'm04-report-2', next: 'm04-report-spared' },
    // what became of the Toll Sergeant, then the Regent's ledger
    {
      id: 'm04-report-spared', speaker: 'gaut', textKey: P + 'm04-report-spared',
      when: { flag: 'story.m04.sergeant', equals: 'spared' }, next: 'm04-report-killed',
    },
    {
      id: 'm04-report-killed', speaker: 'gaut', textKey: P + 'm04-report-killed',
      when: { not: { flag: 'story.m04.sergeant', equals: 'spared' } }, next: 'm04-report-ledger',
    },
    { id: 'm04-report-ledger', speaker: 'gaut', textKey: P + 'm04-report-ledger', next: null },

    { id: 'm06-gate-wait', speaker: 'gaut', textKey: P + 'm06-gate-wait', next: null },
    // class trainer (Halvard Bastion yard)
    { id: 'trainer-closed', speaker: 'gaut', textKey: P + 'trainer-closed', next: null },
    { id: 'trainer-open', speaker: 'gaut', textKey: P + 'trainer-open', next: 'trainer-open-2' },
    {
      id: 'trainer-open-2', speaker: 'gaut', textKey: P + 'trainer-open-2',
      choices: [
        { id: 'train', textKey: P + 'trainer-open-2.train', effects: [{ event: 'classes.trainer.open', payload: { classId: 'knight' } }], next: null },
        { id: 'leave', textKey: P + 'trainer-open-2.leave', next: null },
      ],
    },

    { id: 'idle-cold', speaker: 'gaut', textKey: P + 'idle-cold', next: null },
    { id: 'idle-banked', speaker: 'gaut', textKey: P + 'idle-banked', next: null },
    { id: 'idle', speaker: 'gaut', textKey: P + 'idle', next: null },
  ],
};
