import type { Condition, QuestDef } from '../../../types';
import { reads, story } from '../../act2/helpers';
import { rewardOf } from './rewards';

export const M43_TRIALS = ['walk', 'pyres', 'dance'] as const;
export type M43Trial = (typeof M43_TRIALS)[number];
/** The trial-master who opens each trial (talk objective `<trial>Talk`). */
export const M43_MASTER: Readonly<Record<M43Trial, string>> = { walk: 'walker-knots', pyres: 'walker-pyres', dance: 'hrodna' };
export const M43_DONE: Readonly<Record<M43Trial, string>> = { walk: 'story.m43.walk', pyres: 'story.m43.pyres', dance: 'story.m43.dance' };

// ---- the Storm Walk --------------------------------------------------------------------------------------------------------
/** The walk is running (set on stepping onto the start after Osgar's talk; cleared at the end or on a load). */
export const M43_WALKING = 'story.m43.walking';
export const M43_WALK_START_TRIGGER = 'trg.waste.q.m43.walk-start';
export const M43_KNOTS = 5;
/** Knots passed in order (0 to 5). */
export const M43_KNOT = 'story.m43.knot';
/** The two lee cairns with a storm-wall wait (knots 2 and 4). */
export const M43_LEES = [2, 4] as const;
export const M43_LEE_DONE = (n: number): string => `story.m43.lee${n}`;
/** The knot-count bar at the end (L10's BeatRun, R13's widen and assist). */
export const M43_COUNT = 'use:m43-knot-count';
export const M43_COUNT_FAILS = 'story.m43.countFails';

// ---- the Pyre Rite ---------------------------------------------------------------------------------------------------------
export const M43_PYRE_GROUP = (n: number): string => `m43.pyre-${n}`;
/** Wraiths laid to rest plus Blightblooms burned (0 to 3). */
export const M43_PYRE_COUNT = 'story.m43.pyreCount';
export const M43_PYRE_RESTED = (n: number): string => `story.m43.pyre${n}`;
export const M43_PYRE_ARM = 'story.m43.pyresArmed';
export const M43_TORCH = 'use:m43-torch';
export const M43_BLOOM = (n: number): string => `use:m43-bloom-${n}`;
export const M43_BLOOM_BURNED = (n: number): string => `story.m43.bloom${n}`;
/** A Release this close to a pyre lays its wraith to rest. */
export const M43_PYRE_RADIUS = 6;
/** A wraith killed at a pyre rises again after this many seconds. */
export const M43_RERISE_S = 8;

// ---- the Spear-Dance -------------------------------------------------------------------------------------------------------
export const M43_DANCE_TRIAL = 'm43.spear-dance';
/** Hrodna's offer (dialogue event): the director starts the bout. */
export const M43_DANCE_ASKED = 'story.m43.danceAsked';
export const M43_DANCE_LOST = 'story.m43.danceLost';
export const M43_NOTES = ['note-m43-count-stones', 'note-m43-spear-rack'] as const;

const done = (o: string): Condition => ({ objective: ['m43', o], done: true });
const briefed = done('brief');

/**
 * M43 What the Walkers Know (plan 2.7, invented trials, Q6). After Wulfhild's brief the three trials run in any order: the
 * Storm Walk (Osgar; a forced storm along the knotted guide rope, two lee waits, the knot-count bar), the Pyre Rite (Aelfgifu;
 * three wraiths laid to rest at the pyres with Release, or Blightblooms burned with a torch, in any mix) and the Spear-Dance
 * (a bout with Hrodna on the trial service; a loss is retried). Then the tribe's welcome: A +8, the Walker Tattoo.
 */
export const m43: QuestDef = {
  id: 'm43',
  titleKey: 'quest.m43.title',
  summaryKey: 'quest.m43.summary',
  sequential: false,
  startWhen: { quest: 'm42', state: 'completed' },
  objectives: [
    { id: 'brief', type: 'talk', target: 'wulfhild', textKey: 'quest.m43.brief' },
    ...M43_TRIALS.flatMap((t) => [
      { id: `${t}Talk`, type: 'talk' as const, target: M43_MASTER[t], textKey: `quest.m43.${t}Talk`, when: briefed },
      story(t, `quest.m43.${t}`, M43_DONE[t], { doneWhen: { flag: M43_DONE[t], equals: true }, when: done(`${t}Talk`) }),
    ]),
    reads('lore', 'quest.m43.lore', M43_NOTES, { when: briefed }),
    {
      id: 'welcome', type: 'talk', target: 'wulfhild', textKey: 'quest.m43.welcome',
      when: { all: [...M43_TRIALS.map((t) => done(t)), done('lore')] },
    },
  ],
  rewards: [...rewardOf('m43', 900), { favour: 'ashwalkers', delta: 8 }],
};
