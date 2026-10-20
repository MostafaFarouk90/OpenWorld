import type { Condition, DialogueDef, Effect } from '../../quests/types';

const P = 'dialogue.npc-stane.';
const r02Active: Condition = { quest: 'r02', state: 'active' };
const done = (o: string): Condition => ({ objective: ['r02', o], done: true });

const classOpen: Condition = { flag: 'story.m07.classOpen', equals: true };
const m07Seen: Condition = { any: [{ quest: 'm07', state: 'active' }, { quest: 'm07', state: 'completed' }] };
/** Stane runs the board in the Bastion yard from M06 on (R02_AT_BASTION in src/quests/content/r02.quest.ts). */
const atBastion: Condition = { flag: 'story.m06.started', equals: true };

/** Calls a sparring bout where Stane stands now (the density pass; spawners in src/enemies/densitySpawners.ts). */
const callBout = (bout: 'bout' | 'pair'): Effect => ({
  if: atBastion,
  then: [{ setFlag: `story.r02.${bout}.bastion`, value: true }],
  else: [{ setFlag: `story.r02.${bout}.yard`, value: true }],
});

export const npcStane: DialogueDef = {
  id: 'npc-stane',
  start: [
    { when: { quest: 't03', state: 'active' }, node: 'wave' },
    // the Bastion's own greeting first (the lead reads the general entry below)
    { when: { all: [{ quest: 'm02', state: 'completed' }, { quest: 'r02', state: 'inactive' }, atBastion] }, node: 'r02-offer-bastion' },
    { when: { all: [{ quest: 'm02', state: 'completed' }, { quest: 'r02', state: 'inactive' }] }, node: 'r02-offer' },
    // the density pass: a bout with a yard veteran and one with two, a story of the ford between each challenge
    { when: { all: [r02Active, done('pair')] }, node: 'r02-done' },
    { when: { all: [r02Active, done('story2')] }, node: 'r02-tip-pair' },
    { when: { all: [r02Active, done('bout')] }, node: 'r02-story2' },
    { when: { all: [r02Active, done('story1')] }, node: 'r02-tip-bout' },
    { when: { all: [r02Active, done('o4')] }, node: 'r02-story1' },
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
    { id: 'r02-offer-bastion', speaker: 'stane', textKey: P + 'r02-offer-bastion', next: 'r02-offer-2' },
    {
      id: 'r02-offer-2', speaker: 'stane', textKey: P + 'r02-offer-2',
      choices: [
        { id: 'accept', textKey: P + 'r02-offer-2.accept', effects: [{ startQuest: 'r02' }], next: 'r02-brief' },
        { id: 'later', textKey: P + 'r02-offer-2.later', next: 'r02-later' },
        // in the Bastion from M07 the Warden trainer is not hidden behind the drill offer
        { id: 'train', textKey: P + 'trainer-open-2.train', when: classOpen, next: 'trainer-open-2' },
      ],
    },
    { id: 'r02-brief', speaker: 'stane', textKey: P + 'r02-brief', next: null },
    { id: 'r02-later', speaker: 'stane', textKey: P + 'r02-later', next: null },
    { id: 'r02-tip-open', speaker: 'stane', textKey: P + 'r02-tip-open', next: null },
    { id: 'r02-tip-parry', speaker: 'stane', textKey: P + 'r02-tip-parry', next: null },
    { id: 'r02-tip-guard', speaker: 'stane', textKey: P + 'r02-tip-guard', next: null },
    { id: 'r02-story1', speaker: 'stane', textKey: P + 'r02-story1', next: 'r02-story1-2' },
    { id: 'r02-story1-2', speaker: 'stane', textKey: P + 'r02-story1-2', next: 'r02-story1-3' },
    { id: 'r02-story1-3', speaker: 'stane', textKey: P + 'r02-story1-3', next: null, effects: [callBout('bout')] },
    // a tip also calls the bout where Stane stands now (he moves to the Bastion when M06 starts)
    { id: 'r02-tip-bout', speaker: 'stane', textKey: P + 'r02-tip-bout', next: null, effects: [callBout('bout')] },
    { id: 'r02-story2', speaker: 'stane', textKey: P + 'r02-story2', next: 'r02-story2-2' },
    { id: 'r02-story2-2', speaker: 'stane', textKey: P + 'r02-story2-2', next: 'r02-story2-2b' },
    { id: 'r02-story2-2b', speaker: 'cael', textKey: P + 'r02-story2-2b', next: 'r02-story2-2c' },
    { id: 'r02-story2-2c', speaker: 'stane', textKey: P + 'r02-story2-2c', next: 'r02-story2-3' },
    { id: 'r02-story2-3', speaker: 'stane', textKey: P + 'r02-story2-3', next: null, effects: [callBout('pair')] },
    { id: 'r02-tip-pair', speaker: 'stane', textKey: P + 'r02-tip-pair', next: null, effects: [callBout('pair')] },
    { id: 'r02-done', speaker: 'stane', textKey: P + 'r02-done', next: 'r02-last' },
    { id: 'r02-last', speaker: 'stane', textKey: P + 'r02-last', next: 'r02-last-2' },
    { id: 'r02-last-2', speaker: 'stane', textKey: P + 'r02-last-2', next: 'r02-last-3' },
    { id: 'r02-last-3', speaker: 'stane', textKey: P + 'r02-last-3', next: 'r02-done-2' },
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
