import type { QuestDef } from '../../../types';
import { ACT4_REWARDS_IDS } from './rewards';
import { reads, story } from '../../act2/helpers';
import { ACT4_SPAWN_FLAGS } from '../../../../harrowmark/act4/spawners';

export const R20_CHOICE = 'story.r20.choice';
export type R20Way = 'bribe' | 'stealth' | 'force';
export const R20_WAYS: readonly R20Way[] = ['bribe', 'stealth', 'force'];
/** Favour per way (design 3 favour ledger): bribe O +4 H -2, stealth O +2, force H +2 O -3. */
export const R20_FAVOUR: Readonly<Record<R20Way, { oswin: number; halvard: number }>> = {
  bribe: { oswin: 4, halvard: -2 },
  stealth: { oswin: 2, halvard: 0 },
  force: { oswin: -3, halvard: 2 },
};
export const R20_POSTS = [1, 2, 3] as const;
export const R20_PASSED = (n: number): string => `story.r20.cp${n}.passed`;
/** The cart is parked short of post `n` (its leg arrived): only then does the post's bribe, watch or fight come up. */
export const R20_AT = (n: number): string => `story.r20.leg${n}.in`;
export const R20_FORCE_FLAG = ACT4_SPAWN_FLAGS.r20Force;
export const R20_STEALTH_FLAG = ACT4_SPAWN_FLAGS.r20Stealth;
export const R20_FORCE_GROUP = (n: number): string => `r20.cp.${n}`;
export const R20_SECTION = (n: number): string => `r20.cp${n}`;
/** The three posts' sergeants (my minor cast; a bribe is paid to them). */
export const R20_SERGEANT = (n: number): string => `r20-sergeant-${n}`;
/** A bribe per post: 150 gold, 100 at Oswin Banked or better (plan 2.7). */
export const R20_BRIBE = 150;
export const R20_BRIBE_BANKED = 100;
export const R20_ESCORT = 'r20.convoy';
export const R20_LOAD = 'use:r20-load';
export const R20_LOADED = 'story.r20.loaded';
export const R20_THROUGH = 'story.r20.through';
export const R20_NOTES = ['note-r20-manifest', 'note-r20-tally-1', 'note-r20-tally-2', 'note-r20-tally-3'] as const;

const post = (n: number) =>
  story(`cp${n}`, `quest.r20.cp${n}`, R20_PASSED(n), { doneWhen: { flag: R20_PASSED(n), equals: true } });

/**
 * R20 Oswin's Silver (plan 2.7). Merrin's convoy goes out through three of Vey's posts (the River Gate inside and the two
 * farm-ring huts). The way is chosen with Merrin: bribe each sergeant, slip each post's watch (a stealth section per post) or
 * break each post (a fight). The cart halts at each post until it is passed; a tally is read at each.
 */
export const r20: QuestDef = {
  id: 'r20',
  titleKey: 'quest.r20.title',
  summaryKey: 'quest.r20.summary',
  sequential: true,
  startWhen: { quest: 'm36', state: 'completed' },
  objectives: [
    { id: 'brief', type: 'talk', target: 'merrin', textKey: 'quest.r20.brief' },
    reads('manifest', 'quest.r20.manifest', [R20_NOTES[0]]),
    { id: 'load', type: 'interact', target: R20_LOAD, textKey: 'quest.r20.load' },
    post(1),
    reads('tally1', 'quest.r20.tally', [R20_NOTES[1]]),
    post(2),
    reads('tally2', 'quest.r20.tally', [R20_NOTES[2]]),
    post(3),
    reads('tally3', 'quest.r20.tally', [R20_NOTES[3]]),
    story('through', 'quest.r20.through', 'escort.arrived', { match: { escortId: R20_ESCORT }, doneWhen: { flag: R20_THROUGH, equals: true } }),
    { id: 'report', type: 'talk', target: 'merrin', textKey: 'quest.r20.report' },
  ],
  rewards: [{ xp: 600 }, { give: [{ itemId: ACT4_REWARDS_IDS.r20, count: 1 }] }],
};
