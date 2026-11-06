import type { QuestDef } from '../../../types';
import { reads, story } from '../../act2/helpers';
import { rewardOf } from './rewards';

/** F8: `all` (A +10) or `half` (A -4, H +3); written by the choice at the camp gate (L1 fills the cisterns or stands the casks). */
export const R24_CHOICE = 'story.r24.choice';
export type R24Way = 'all' | 'half';
/** Raised by the choice line itself (the step is done on the flag). */
export const R24_CHOSEN_EVENT = 'story.r24.chosen';
export const R24_ESCORT = 'r24.cart';
export const R24_CARTER = 'walker-carter';
export const R24_LOAD = 'use:r24-load';
export const R24_LOADED = 'story.r24.loaded';
export const R24_ARRIVED = 'story.r24.arrived';
/** From the load to the arrival Brand walks as L4's escort member, so his camp figure is away (a director-derived flag). */
export const R24_CART_OUT = 'story.r24.cartOut';
export const R24_UNLOAD = 'use:r24-unload';
export const R24_UNLOADED = 'story.r24.unloaded';
/** The two shelters the cart waits out a storm in, nearest the spring first (L1's `rope.camp-crossing`). */
export const R24_SHELTERS = ['shelter.camp-crossing.3', 'shelter.camp-crossing.2'] as const;
export const R24_BRAKE = (n: 1 | 2): string => `use:r24-brake-${n}`;
export const R24_BRAKED = (n: 1 | 2): string => `story.r24.brake${n}`;
/** The shelter storm at shelter n has blown out (the 40 s forced storm). */
export const R24_WAITED = (n: 1 | 2): string => `story.r24.waited${n}`;
export const R24_STORM_S = 40;
export const R24_GROUPS = ['r24.striders', 'r24.wraiths'] as const;
/** Fraction of the route at which each attack group is armed. */
export const R24_ATTACK_AT = [0.35, 0.7] as const;
export const R24_ARM = (n: 1 | 2): string => `story.r24.attack${n}`;
export const R24_SPRING_NOTE = 'note-r24-spring';

/**
 * R24 Ashwalker Water-Debt (plan 2.7). Wulfhild sends Cael to the Glasslands spring; Brand loads the rain-casks; the cart rolls
 * back to the camp on L4's escort at 1.5 m/s, waiting out a storm at two shelters (the brake set each time) and attacked twice;
 * at the camp gate Cael chooses all the casks for the walkers or half for Harrowmark's refugees.
 */
export const r24: QuestDef = {
  id: 'r24',
  titleKey: 'quest.r24.title',
  summaryKey: 'quest.r24.summary',
  sequential: true,
  startWhen: { quest: 'm43', state: 'completed' },
  objectives: [
    { id: 'brief', type: 'talk', target: 'wulfhild', textKey: 'quest.r24.brief' },
    { id: 'carter', type: 'talk', target: R24_CARTER, textKey: 'quest.r24.carter' },
    reads('spring', 'quest.r24.spring', [R24_SPRING_NOTE]),
    { id: 'load', type: 'interact', target: R24_LOAD, textKey: 'quest.r24.load' },
    story('brake1', 'quest.r24.brake1', R24_WAITED(1), { doneWhen: { flag: R24_WAITED(1), equals: true } }),
    story('brake2', 'quest.r24.brake2', R24_WAITED(2), { doneWhen: { flag: R24_WAITED(2), equals: true } }),
    story('arrive', 'quest.r24.arrive', 'escort.arrived', { match: { escortId: R24_ESCORT }, doneWhen: { flag: R24_ARRIVED, equals: true } }),
    // a flag step, not a talk: another Wulfhild talk ending in the same conversation must not pass the choice by
    story('choose', 'quest.r24.choose', R24_CHOSEN_EVENT, { doneWhen: { any: [{ flag: R24_CHOICE, equals: 'all' }, { flag: R24_CHOICE, equals: 'half' }] } }),
    { id: 'unload', type: 'interact', target: R24_UNLOAD, textKey: 'quest.r24.unload' },
  ],
  rewards: rewardOf('r24', 600),
};
