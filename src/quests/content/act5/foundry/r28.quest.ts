import type { Condition, QuestDef } from '../../../types';
import { reads, story } from '../../act2/helpers';
import { R28_LAID, R28_LIT, R28_PYRES, R28_RISEN_DOWN } from './flags';
import { NOT_DESCENDED, phaseJOpen } from './phase';
import { rewardOf } from './rewards';

export const R28_PYRE_NS = [1, 2, 3, 4] as const;
/** The two pyres where a dead soldier rises (plan 2.7). */
export const R28_RISERS = [2, 4] as const;
export const R28_MOURNER = (n: number): string => `r28-mourner-${n}`;
export const R28_NAME_NOTE = (n: number): string => `note-r28-name-${n}`;
export const R28_TOKEN_ID = (n: number): string => `r28-token-${n}`;
export const R28_LAY = (n: number): string => `use:r28-lay-${n}`;
export const R28_LIGHT = (n: number): string => `use:r28-light-${n}`;
export const R28_GROUP = (n: number): string => `r28.risen-${n}`;
/** Heartshard fire costs this much Burn a pyre (design 9.7). */
export const R28_BURN_COST = 10;
/** Ashwalker favour per pyre lit (design: A +2 each), paid once on the hand-in. */
export const R28_FAVOUR_PER_PYRE = 2;
export const R28_RITE = 'story.r28.rite';

const done = (o: string): Condition => ({ objective: ['r28', o], done: true });
const briefed = done('brief');

/**
 * R28 The Ashwalkers' Pyre (plan 2.2 and 2.7, Q6). The siege's fallen lie on four pyres in the Rim Gate's court. At each pyre,
 * in any order: hear the mourner, find the dead soldier's name, carry their token to the pyre, lay the wood. The dead rise at
 * pyres 2 and 4 and are laid to rest (Release, or a kill: they do not rise again). Each laid pyre may be lit with Heartshard
 * fire for 10 Burn (optional: the quest completes with none lit). With F8 All the Ashwalkers light theirs beside Cael. Then the
 * rite and Wulfhild's farewell; A +2 for each pyre lit, below the M52 line (the D09 and M56 snapshots read it).
 */
export const r28: QuestDef = {
  id: 'r28',
  titleKey: 'quest.r28.title',
  summaryKey: 'quest.r28.summary',
  sequential: false,
  startWhen: { all: [phaseJOpen(), NOT_DESCENDED] },
  objectives: [
    { id: 'brief', type: 'talk', target: 'wulfhild', textKey: 'quest.r28.brief' },
    ...R28_PYRE_NS.flatMap((n) => [
      { id: `mourner${n}`, type: 'talk' as const, target: R28_MOURNER(n), textKey: `quest.r28.mourner${n}`, when: briefed },
      reads(`name${n}`, `quest.r28.name${n}`, [R28_NAME_NOTE(n)], { when: done(`mourner${n}`) }),
      { id: `token${n}`, type: 'carry' as const, target: `trg.caldera.q.f.r28.pyre.${n}`, textKey: `quest.r28.token${n}`, when: done(`name${n}`) },
      ...((R28_RISERS as readonly number[]).includes(n)
        ? [story(`risen${n}`, `quest.r28.risen${n}`, R28_RISEN_DOWN(n), { doneWhen: { flag: R28_RISEN_DOWN(n), equals: true }, when: done(`token${n}`) })]
        : []),
      story(`lay${n}`, `quest.r28.lay${n}`, R28_LAID(n), {
        doneWhen: { flag: R28_LAID(n), equals: true },
        when: done((R28_RISERS as readonly number[]).includes(n) ? `risen${n}` : `token${n}`),
      }),
    ]),
    story('rite', 'quest.r28.rite', R28_RITE, { doneWhen: { flag: R28_RITE, equals: true }, when: { all: R28_PYRE_NS.map((n) => done(`lay${n}`)) } }),
    { id: 'farewell', type: 'talk', target: 'wulfhild', textKey: 'quest.r28.farewell', when: done('rite') },
  ],
  rewards: [
    ...rewardOf('r28'),
    // A +2 a pyre lit (0 to 4), read when the hand-in pays
    ...R28_PYRE_NS.map((n) => ({ if: { flag: R28_LIT(n), equals: true }, then: [{ favour: 'ashwalkers' as const, delta: R28_FAVOUR_PER_PYRE }] })),
  ],
};
export { R28_PYRES };
