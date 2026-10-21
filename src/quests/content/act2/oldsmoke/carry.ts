import type { CarryItemSpec } from '../../carry';
import { R09_OFFICE_TRIGGER } from './r09.quest';

/** R09's payroll chests (anchors are A4's market cellars): a carried bundle, delivered to the paymaster's office. */
export const OLDSMOKE_CARRY: CarryItemSpec[] = [1, 2, 3].map((n) => ({
  id: `r09-chest-${n}`, interactableId: `pickup:r09-chest-${n}`, homeAnchor: `oldsmoke.market.chest.${n}`, deliveredFlag: `story.r09.chest${n}.delivered`,
  questId: 'r09', objectiveId: 'chests', destination: R09_OFFICE_TRIGGER, promptKey: 'quest.prompt.carryChest', look: 'bundle',
}));
