import type { CarryItemSpec } from '../../carry';
import { FA } from './anchors';
import { R28_TOKEN } from './flags';
import { R28_PYRE_NS, R28_TOKEN_ID } from './r28.quest';
import { R28_PYRE_TRIGGER } from './triggers';

/** R28: each fallen soldier's token (a shield boss, a tally, a pick-head, a knot-cord), carried from the name to the pyre. */
export const FOUNDRY_A5_CARRY: CarryItemSpec[] = R28_PYRE_NS.map((n) => ({
  id: R28_TOKEN_ID(n), interactableId: `pickup:${R28_TOKEN_ID(n)}`, homeAnchor: FA.token(n), deliveredFlag: R28_TOKEN(n),
  questId: 'r28', objectiveId: `token${n}`, destination: R28_PYRE_TRIGGER(n), promptKey: 'quest.prompt.a5f.token', look: 'bundle',
}));
