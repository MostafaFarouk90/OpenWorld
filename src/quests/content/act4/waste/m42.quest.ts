import type { QuestDef } from '../../../types';
import { reads, story } from '../../act2/helpers';
import { rewardOf } from './rewards';

/** Written by the gate-arch trigger: the forced storm runs from here to the camp (plan 3, M42 step 3). */
export const M42_GATE = 'story.m42.gate';
export const M42_GATE_TRIGGER = 'trg.waste.q.m42.gate';
export const M42_CAMP = 'story.m42.camp';
export const M42_CAMP_TRIGGER = 'trg.waste.q.m42.camp';
/** The four shelters of `rope.ashgate-camp`, in order (L1's ids). */
export const M42_SHELTERS = [1, 2, 3, 4].map((n) => `shelter.ashgate-camp.${n}`);
/** Pulled on entering a shelter; starts the storm-wall wait. */
export const M42_FLAP = (n: number): string => `use:m42-flap-${n}`;
export const M42_FLAP_USED = (n: number): string => `story.m42.flap${n}`;
/** The wall has passed at shelter n (written by the director after the wait). */
export const M42_SHELTERED = (n: number): string => `story.m42.shelter${n}`;
export const M42_GROUPS = { striders: 'm42.striders', wraiths: 'm42.wraiths' } as const;
export const M42_DOWN = { striders: 'story.m42.stridersDown', wraiths: 'story.m42.wraithsDown' } as const;
export const M42_NOTES = { pack: 'note-m42-pack', knot: 'note-m42-knot' } as const;
export const HILD = 'hild-ropewright';

const shelter = (n: number) =>
  story(`shelter${n}`, `quest.m42.shelter${n}`, M42_SHELTERED(n), { doneWhen: { flag: M42_SHELTERED(n), equals: true } });

/**
 * M42 Gate of Ash (plan 2.3, 2.7). Wulfhild at Ashgate; Hild clips Cael to the rope; through the gate arch the storm is forced
 * (L3's `forceStorm`) and the crossing goes shelter to shelter on `rope.ashgate-camp`, a storm wall passing at each; striders
 * between the first and second shelter, husk wraiths between the third and fourth; the camp; Wulfhild gives the mask.
 */
export const m42: QuestDef = {
  id: 'm42',
  titleKey: 'quest.m42.title',
  summaryKey: 'quest.m42.summary',
  sequential: true,
  startWhen: { quest: 'm41', state: 'completed' },
  objectives: [
    { id: 'brief', type: 'talk', target: 'wulfhild', textKey: 'quest.m42.brief' },
    { id: 'clip', type: 'talk', target: HILD, textKey: 'quest.m42.clip' },
    story('gate', 'quest.m42.gate', M42_GATE, { doneWhen: { flag: M42_GATE, equals: true } }),
    shelter(1),
    story('striders', 'quest.m42.striders', M42_DOWN.striders, { doneWhen: { flag: M42_DOWN.striders, equals: true } }),
    shelter(2),
    reads('pack', 'quest.m42.pack', [M42_NOTES.pack]),
    shelter(3),
    story('wraiths', 'quest.m42.wraiths', M42_DOWN.wraiths, { doneWhen: { flag: M42_DOWN.wraiths, equals: true } }),
    shelter(4),
    reads('knot', 'quest.m42.knot', [M42_NOTES.knot]),
    story('camp', 'quest.m42.camp', M42_CAMP, { doneWhen: { flag: M42_CAMP, equals: true } }),
    // Osgar takes the clip off at the camp edge (a pacing addition, L13 Phase H M1: M42 at 43% by the shipped count)
    { id: 'unclip', type: 'talk', target: 'walker-knots', textKey: 'quest.m42.unclip' },
    { id: 'report', type: 'talk', target: 'wulfhild', textKey: 'quest.m42.report' },
  ],
  rewards: rewardOf('m42', 850),
};
