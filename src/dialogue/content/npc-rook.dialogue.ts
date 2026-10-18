import type { Condition, DialogueDef, DialogueNode } from '../../quests/types';
import { D02_PREREQUISITES } from '../../quests/content/d02.quest';
import { M06_BRIBE_GOLD, M06_TIP_GOLD } from '../../quests/content/gold';

const P = 'dialogue.npc-rook.';
const done = (q: string, o: string): Condition => ({ objective: [q, o], done: true });
const active = (q: string): Condition => ({ quest: q, state: 'active' });
const inactive = (q: string): Condition => ({ quest: q, state: 'inactive' });
const completed = (q: string): Condition => ({ quest: q, state: 'completed' });
const outcome = (v: string): Condition => ({ flag: 'boss.gaffer-grimtooth.outcome', equals: v });
const route = (v: string): Condition => ({ flag: 'story.m06.route', equals: v });

/** Prerequisites in the order Rook names the first unfinished one (m01 to m05 are lumped into one early line). */
const LOCK_ORDER = ['r01', 'r02', 'm07', 'm08', 'm09', 'm10', 'r03', 'r04'];

const lockEntries = LOCK_ORDER.map((q) => ({
  when: { all: [inactive('d02'), completed('m06'), { not: completed(q) }] } as Condition,
  node: `d02-locked-${q}`,
}));

const routeFlags = (r: string) => [
  { setFlag: 'story.m06.route', value: r },
  { setFlag: 'story.m06.gateOpen', value: true },
  { completeObjective: ['m06', 'o2'] as [string, string] },
];

const say = (id: string, next: string | null = null, extra: Partial<DialogueNode> = {}): DialogueNode =>
  ({ id, speaker: 'rook', textKey: P + id, next, ...extra });

export const npcRook: DialogueDef = {
  id: 'npc-rook',
  start: [
    // D02 in progress
    { when: { all: [active('d02'), done('d02', 'o4'), outcome('released')] }, node: 'd02-report-released' },
    { when: { all: [active('d02'), done('d02', 'o4'), outcome('defeated')] }, node: 'd02-report-defeated' },
    { when: { all: [active('d02'), done('d02', 'o3')] }, node: 'd02-grimtooth-remind' },
    { when: { all: [active('d02'), done('d02', 'o2')] }, node: 'd02-hounds-remind' },
    { when: active('d02'), node: 'd02-descend-remind' },

    // D02 offer, or the first unfinished prerequisite
    {
      when: { all: [inactive('d02'), completed('m06'), ...D02_PREREQUISITES.map((q) => completed(q))] },
      node: 'd02-offer',
    },
    ...lockEntries,
    {
      when: {
        all: [inactive('d02'), completed('m06'), { any: ['m01', 'm02', 'm03', 'm04', 'm05'].map((q): Condition => ({ not: completed(q) })) }],
      },
      node: 'd02-locked-early',
    },

    // M06 Gates of Harrowmark
    { when: { all: [active('m06'), done('m06', 'o2')] }, node: 'm06-proof' },
    { when: active('m06'), node: 'm06-choose-again' },
    { when: { all: [inactive('m06'), completed('m05'), { favour: 'halvard', band: 'cold' }] }, node: 'm06-intro-cold' },
    { when: { all: [inactive('m06'), completed('m05')] }, node: 'm06-intro' },

    // idles
    { when: { all: [completed('m06'), route('stealth')] }, node: 'idle-stealth' },
    { when: { all: [completed('m06'), route('bribe')] }, node: 'idle-bribe' },
    { when: { all: [completed('m06'), route('persuasion')] }, node: 'idle-persuasion' },
    { when: { all: [] }, node: 'idle' },
  ],
  nodes: [
    // ---- M06 ----
    say('m06-intro-cold', 'm06-intro-2'),
    say('m06-intro', 'm06-intro-2'),
    say('m06-intro-2', 'm06-offer'),
    {
      id: 'm06-offer', speaker: 'rook', textKey: P + 'm06-offer',
      choices: [
        { id: 'accept', textKey: P + 'm06-offer.accept', effects: [{ startQuest: 'm06' }, { completeObjective: ['m06', 'o1'] }], next: 'm06-choose' },
        { id: 'later', textKey: P + 'm06-offer.later', next: 'm06-later' },
      ],
    },
    say('m06-later'),
    say('m06-choose-again', 'm06-choose'),
    {
      id: 'm06-choose', speaker: 'rook', textKey: P + 'm06-choose',
      choices: [
        { id: 'sneak', textKey: P + 'm06-choose.sneak', next: 'm06-sneak' },
        {
          id: 'bribe', textKey: P + 'm06-choose.bribe', when: { gold: { atLeast: M06_BRIBE_GOLD } },
          effects: [{ spendGold: { amount: M06_BRIBE_GOLD, reason: 'bribe' } }, ...routeFlags('bribe')], next: 'm06-bribe-ok',
        },
        {
          id: 'argue-free', textKey: P + 'm06-choose.argue-free', when: { favour: 'halvard', band: ['stoked', 'hearthbound'] },
          effects: routeFlags('persuasion'), next: 'm06-argue-ok',
        },
        {
          id: 'argue-tip', textKey: P + 'm06-choose.argue-tip',
          when: { all: [{ favour: 'halvard', band: 'banked' }, { gold: { atLeast: M06_TIP_GOLD } }] },
          effects: [{ spendGold: { amount: M06_TIP_GOLD, reason: 'persuasion' } }, ...routeFlags('persuasion')], next: 'm06-argue-tip-ok',
        },
      ],
    },
    say('m06-sneak'),
    say('m06-bribe-ok', 'm06-proof'),
    say('m06-argue-ok', 'm06-proof'),
    say('m06-argue-tip-ok', 'm06-proof'),
    say('m06-proof', 'm06-proof-2'),
    say('m06-proof-2', 'm06-proof-3'),
    say('m06-proof-3'),

    // ---- D02 ----
    say('d02-offer', 'd02-offer-2'),
    {
      id: 'd02-offer-2', speaker: 'rook', textKey: P + 'd02-offer-2',
      choices: [
        { id: 'accept', textKey: P + 'd02-offer-2.accept', effects: [{ startQuest: 'd02' }, { completeObjective: ['d02', 'o1'] }], next: 'd02-calm' },
        { id: 'later', textKey: P + 'd02-offer-2.later', next: null },
      ],
    },
    say('d02-calm', 'd02-calm-2', {
      effects: [
        {
          if: { flag: 'story.d02.breadGiven' }, then: [],
          else: [{ give: [{ itemId: 'hearth-bread', count: 5 }] }, { setFlag: 'story.d02.breadGiven', value: true }],
        },
        { unlockMercy: 'calm' },
        { setFlag: 'story.d02.underwaysOpen', value: true },
      ],
    }),
    say('d02-calm-2'),
    ...['r01', 'r02', 'm07', 'm08', 'm09', 'm10', 'r03', 'r04', 'early'].map((q) => say(`d02-locked-${q}`)),
    say('d02-descend-remind'),
    say('d02-hounds-remind'),
    say('d02-grimtooth-remind'),
    say('d02-report-released', 'd02-report-released-2'),
    say('d02-report-released-2'),
    say('d02-report-defeated', 'd02-report-defeated-2'),
    say('d02-report-defeated-2'),

    // ---- idles ----
    say('idle-stealth'),
    say('idle-bribe'),
    say('idle-persuasion'),
    say('idle'),
  ],
};

