// The Phase J opening (coordinator ruling 1): the Foundry quests start on M52 completed plus every flag the Caldera's phase
// hold lists (`PHASE_HOLDS.caldera`, read when the defs are built). In Phase I that list is `story.phase.foundryOpen`, so
// nothing is offered; N12 PR 2 empties the list and the condition goes with it, with no def change.
import { phaseHolds } from '../../../../region/regions';
import type { Condition } from '../../../types';

export function phaseJHold(holds: readonly string[] = phaseHolds('caldera')): Condition[] {
  return holds.map((flag) => ({ flag, equals: true }));
}

/** M52 done and the hold open. */
export function phaseJOpen(holds?: readonly string[]): Condition {
  return { all: [{ quest: 'm52', state: 'completed' }, ...phaseJHold(holds)] };
}
