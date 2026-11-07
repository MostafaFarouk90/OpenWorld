import type { CarryItemSpec } from '../../carry';
import { Q } from './ids';
import { R29_CARRY, R29_DELIVERED, R29_GONG_TRIGGER, R29_PARTS, R29_POSTS } from './r29.quest';

/** R29's three gong parts, each lying at its stoker post and carried back to the gong frame (the shipped carry kit). */
export const RIM_A5_CARRY: CarryItemSpec[] = R29_POSTS.map((n) => ({
  id: `r29-${R29_PARTS[n]}`, interactableId: R29_CARRY(n), homeAnchor: `${Q}.r29.part.${n}`, deliveredFlag: R29_DELIVERED(n),
  questId: 'r29', objectiveId: `carry${n}`, destination: R29_GONG_TRIGGER, promptKey: `quest.prompt.a5r.carry.${R29_PARTS[n]}`, look: 'bundle',
}));
