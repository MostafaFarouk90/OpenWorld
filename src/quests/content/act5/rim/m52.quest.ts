import type { Condition, ObjectiveDef, QuestDef } from '../../../types';
import { story } from '../../act2/helpers';
import { rewardOf } from './rewards';
import { TQ } from './ids';

export const M52_GIVER = 'wystan';
/** The favour snapshot N4's roster reads (v0.9 item 6), taken once on M52's start. */
export const M52_SNAPSHOT = 'm52';
export const M52_STAIRS_SCENE = 'scene-m52-stairs';
export const M52_STAIRS = 'story.m52.stairs';
/** The goTo at N1's siege start point; arriving starts N4's siege. */
export const M52_START_TRIGGER = `${TQ}.m52.start`;
export const M52_START_ANCHOR = 'caldera.siege.start';
export const M52_WAVES = [1, 2, 3, 4] as const;
export const M52_WAVE = (n: number): string => `story.m52.wave.${n}`;
/** N4's household guard (wave 4): `siege.guard.fallen` per guard, two of them. */
export const M52_GUARD_EVENT = 'siege.guard.fallen';
export const M52_GUARDS = 2;
/** Recap rows for N9 (`RIM_HOLDS_ROWS`): wave 4 held without a breach in that wave; any Warhost Soldier spared in the siege. */
export const M52_WAVE4_HELD = 'story.m52.wave4Held';
export const M52_SPARED_ANY = 'story.m52.sparedAny';
/** N4's spawn tag for every siege foe. */
export const M52_SPAWN_TAG = 'm52.siege';
export const M52_HOLDS_SCENE = 'scene-m52-holds';
export const M52_GATE_HELD = 'story.m52.gateHeld';
/** N4's flag: the companion who sat out wave 3 at the aid post (Q2 a; the beat is scripted, nobody falls). */
export const M52_WOUNDED = 'siege.m52.wounded';
export const M52_COMPANIONS = ['hrolf', 'aelfreda', 'tobb'] as const;
export const M52_WOUNDED_STEP = (c: (typeof M52_COMPANIONS)[number]): string => `wounded-${c}`;
/** What stood at the gate, written by the director from N4's roster on the snapshot when the gate holds (Wystan's report reads them). */
export const M52_STOOD_ROWS = ['halvard', 'grisel', 'ashwalker', 'dragons', 'supply'] as const;
export const M52_STOOD = (row: (typeof M52_STOOD_ROWS)[number]): string => `story.m52.stood.${row}`;

const done = (o: string): Condition => ({ objective: ['m52', o], done: true });
const wave = (n: number): ObjectiveDef =>
  story(`wave${n}`, `quest.m52.wave${n}`, M52_WAVE(n), { doneWhen: { flag: M52_WAVE(n), equals: true }, when: done(n === 1 ? 'start' : `wave${n - 1}`) });

/**
 * M52 The Siege of the Rim (plan 2.1, 2.7; Q12). Wystan at the camp, then at the war post by the gate; the warhost on the stairs (scene); the siege start point,
 * where N4's siege takes over (four waves, the orders, the ram, the dragons, the wounded beat); each wave's clear; the household
 * guard in wave 4 (both fallen, or wave 4 cleared without them: a spared guard never stalls the step); the gate holds (scene);
 * the wounded companion at the aid tent (optional); Wystan. Not sequential, so the optional talk can sit beside the report; each
 * step waits on the one before by `when`. The favour snapshot is taken by the director on `quest.started`.
 */
const objectives: ObjectiveDef[] = [
  { id: 'brief', type: 'talk', target: M52_GIVER, textKey: 'quest.m52.brief' },
  { id: 'gate', type: 'talk', target: M52_GIVER, textKey: 'quest.m52.gate', when: done('brief') },
  story('stairs', 'quest.m52.stairs', M52_STAIRS, { doneWhen: { flag: M52_STAIRS, equals: true }, when: done('gate') }),
  { id: 'start', type: 'goTo', target: M52_START_TRIGGER, textKey: 'quest.m52.start', when: done('stairs') },
  wave(1), wave(2), wave(3),
  {
    id: 'guard', type: 'event', target: M52_GUARD_EVENT, textKey: 'quest.m52.guard', required: M52_GUARDS,
    match: { siegeId: 'm52' }, dedupeBy: 'actorId', when: done('wave3'), doneWhen: { flag: M52_WAVE(4), equals: true },
  },
  { ...wave(4), when: done('wave3') },
  story('holds', 'quest.m52.holds', M52_GATE_HELD, { doneWhen: { flag: M52_GATE_HELD, equals: true }, when: { all: [done('wave4'), done('guard')] } }),
  // one optional talk per companion, live only for the one N4 sat out (a talk objective credits a single npc id)
  ...M52_COMPANIONS.map((c): ObjectiveDef => ({
    id: M52_WOUNDED_STEP(c), type: 'talk', target: c, textKey: 'quest.m52.wounded', optional: true,
    when: { all: [done('holds'), { flag: M52_WOUNDED, equals: c }] },
  })),
  { id: 'report', type: 'talk', target: M52_GIVER, textKey: 'quest.m52.report', when: done('holds') },
];

export const m52: QuestDef = {
  id: 'm52',
  titleKey: 'quest.m52.title',
  summaryKey: 'quest.m52.summary',
  startWhen: { all: (['m47', 'm48', 'm49', 'm50', 'm51', 'r26'] as const).map((q): Condition => ({ quest: q, state: 'completed' })) },
  objectives,
  rewards: rewardOf('m52', 1200),
};
