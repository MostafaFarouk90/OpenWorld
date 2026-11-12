import type { Condition, ObjectiveDef, QuestDef } from '../../../types';
import { reads, story } from '../../act2/helpers';
import { rewardOf } from './rewards';

export const M49_SIGNAL = 'use:m49-signal';
export const M49_ARRIVAL_SCENE = 'scene-m49-arrival';
/** Written at the arrival scene's checkpoint (the column has come up): the allies stand at their Rim Camp posts from here. */
export const M49_ARRIVED = 'story.m49.arrived';
export const M49_HOUSES = ['halvard', 'oswin', 'grisel'] as const;
export type M49House = (typeof M49_HOUSES)[number];
/** F3: a House's delegate was won at M36 (L10's flag). */
export const DELEGATE_FLAG = (h: M49House): string => `story.m36.delegate.${h}`;
export const delegateWon = (h: M49House): Condition => ({ flag: DELEGATE_FLAG(h), equals: 'won' });
export const NO_HOUSE_WON: Condition = { all: M49_HOUSES.map((h) => ({ not: delegateWon(h) })) };
/** A won House's banner pole at the Rim Gate, and the camp's own pole when no House was won (the step never stalls). */
export const M49_BANNER = (h: M49House | 'camp'): string => `use:m49-banner-${h}`;
export const M49_BANNER_RAISED = (h: M49House | 'camp'): string => `story.m49.banner.${h}`;
/** Every banner that should fly is up (the director writes it). */
export const M49_BANNERS = 'story.m49.banners';
export const M49_RISE_SCENE = 'scene-m49-banners';
export const M49_RISEN = 'story.m49.risen';
/** The war table (a prop that opens a one-way talk read from the forecast) and the three posts Cael sets. */
export const M49_TABLE = 'use:m49-war-table';
export const M49_TABLE_NPC = 'scene.m49.table';
export const M49_TABLE_DIALOGUE = 'scene-m49-table';
/**
 * The war table's forecast (plan 2.7 point 5): the director reads N4's `siegeRoster` on live favour (no snapshot exists yet) just
 * before the table's talk opens and writes one flag a row, so the table's lines can say who would stand if the gate were struck
 * today. Rewritten at every opening; never read by the siege (M52 takes its own snapshot).
 */
export const M49_FORECAST_KEYS = ['halvard', 'grisel', 'ashwalker', 'watch', 'named', 'dragons', 'sally', 'engineers', 'storm', 'supply'] as const;
export type M49ForecastKey = (typeof M49_FORECAST_KEYS)[number];
export const M49_FORECAST = (k: M49ForecastKey): string => `story.m49.forecast.${k}`;
export const M49_POSTS = ['brace', 'crates', 'wall'] as const;
export const M49_POST = (p: (typeof M49_POSTS)[number]): string => `use:m49-post-${p}`;
export const M49_POST_SET = (p: (typeof M49_POSTS)[number]): string => `story.m49.post.${p}`;
export const M49_NOTES = { plan: 'note-m49-plan', tally: 'note-m49-tally' } as const;
/** F4 Cleanse (R06): Mother Maud cooks at the camp (N7's flag). */
export const F4_CLEANSED = 'world.cinderreach.cinderford.cleansed';
/** The allies the war council hears, in the order the journal lists them. */
export const M49_ALLIES = ['wystan', 'merrin', 'wenna', 'wulfhild', 'rook', 'edric'] as const;

const done = (o: string): Condition => ({ objective: ['m49', o], done: true });
const allDone = (os: readonly string[]): Condition => ({ all: os.map(done) });
const ARRIVED: Condition = { flag: M49_ARRIVED, equals: true };

/**
 * M49 Allies at the Rim (plan 2.1, 2.7; F3, R19, R21, F4, F8). Hrolf at the camp; the rim's signal fire; the allies come up the
 * stairs (scene; at its checkpoint they stand at their camp posts); each ally's word, in any order (Maud too with F4 Cleanse);
 * the old plan and the stokers' tally; each won House's banner at the Rim Gate (the camp's own when none was won); the banners
 * rise; the war table (a forecast on live favour) and the three posts; Hrolf. Not sequential: each block waits on the one before
 * by `when`, so the talks can be taken in any order.
 */
const objectives: ObjectiveDef[] = [
  { id: 'brief', type: 'talk', target: 'hrolf', textKey: 'quest.m49.brief' },
  { id: 'signal', type: 'interact', target: M49_SIGNAL, textKey: 'quest.m49.signal', when: done('brief') },
  story('arrive', 'quest.m49.arrive', M49_ARRIVED, { doneWhen: ARRIVED, when: done('signal') }),
  ...M49_ALLIES.map((a): ObjectiveDef => ({ id: a, type: 'talk', target: a, textKey: `quest.m49.${a}`, when: ARRIVED })),
  { id: 'maud', type: 'talk', target: 'maud', textKey: 'quest.m49.maud', optional: true, when: { all: [ARRIVED, { flag: F4_CLEANSED, equals: true }] } },
  reads('plan', 'quest.m49.plan', [M49_NOTES.plan], { when: ARRIVED }),
  reads('tally', 'quest.m49.tally', [M49_NOTES.tally], { when: ARRIVED }),
  story('banners', 'quest.m49.banners', M49_BANNERS, { doneWhen: { flag: M49_BANNERS, equals: true }, when: allDone(M49_ALLIES) }),
  story('rise', 'quest.m49.rise', M49_RISEN, { doneWhen: { flag: M49_RISEN, equals: true }, when: done('banners') }),
  { id: 'table', type: 'talk', target: M49_TABLE_NPC, textKey: 'quest.m49.table', when: done('rise') },
  ...M49_POSTS.map((p): ObjectiveDef => ({ id: `post-${p}`, type: 'interact', target: M49_POST(p), textKey: `quest.m49.post.${p}`, when: done('table') })),
  { id: 'report', type: 'talk', target: 'hrolf', textKey: 'quest.m49.report', when: allDone([...M49_POSTS.map((p) => `post-${p}`), 'plan', 'tally']) },
];

export const m49: QuestDef = {
  id: 'm49',
  titleKey: 'quest.m49.title',
  summaryKey: 'quest.m49.summary',
  startWhen: { quest: 'm48', state: 'completed' },
  objectives,
  rewards: rewardOf('m49', 900),
};
