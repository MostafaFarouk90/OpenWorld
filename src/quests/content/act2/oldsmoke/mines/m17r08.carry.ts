import type { CarryItemSpec } from '../../../carry';
import { M17_LIFT_TRIGGER } from './m17.quest';

/**
 * The two trapped miners of M17 (A4's `oldsmoke.shaft.miner.1..2`), carried to the lift. The `look` is the existing
 * wounded figure: plan section 1's `'miner'` look (a tint of the same mesh) needs an edit to `CarryItemSpec`, which is the
 * integrator's to make, after which these two rows can switch to it.
 */
export const M17R08_CARRY: CarryItemSpec[] = [1, 2].map((n) => ({
  id: `m17-miner-${n}`, interactableId: `pickup:m17-miner-${n}`, homeAnchor: `oldsmoke.shaft.miner.${n}`, deliveredFlag: `story.m17.miner${n}.delivered`,
  questId: 'm17', objectiveId: 'miners', destination: M17_LIFT_TRIGGER, promptKey: 'quest.prompt.carryMiner', look: 'wounded',
}));
