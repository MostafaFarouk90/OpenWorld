// The Phase J opening (coordinator ruling 1): the Foundry quests start on M52 completed plus every flag the Caldera's phase
// hold lists (`PHASE_HOLDS.caldera`, read when the defs are built). In Phase I that list is `story.phase.foundryOpen`, so
// nothing is offered; N12 PR 2 empties the list and the condition goes with it, with no def change.
import { phaseHolds } from '../../../../region/regions';
import type { Condition } from '../../../types';

export function phaseJHold(holds: readonly string[] = phaseHolds('caldera')): Condition[] {
  return holds.map((flag) => ({ flag, equals: true }));
}

/** M52 done (its `story.m52.complete`, which the Rim block and the act jump both write) and the hold open. */
export function phaseJOpen(holds?: readonly string[]): Condition {
  return { all: [{ flag: 'story.m52.complete', equals: true }, ...phaseJHold(holds)] };
}

/** The rim's optional quests (R28, R29, R30) are withdrawn once M54 starts (plan 2.3): never offered after the descent. */
export const NOT_DESCENDED: Condition = { not: { flag: 'story.m54.started', equals: true } };

/** The defs with the withdrawal added to R29's start (N10's def, wrapped where the Act 5 index builds the list). */
export function withRimWithdrawal<T extends { id: string; startWhen?: Condition }>(defs: T[]): T[] {
  return defs.map((d) => (d.id === 'r29' && d.startWhen ? { ...d, startWhen: { all: [d.startWhen, NOT_DESCENDED] } } : d));
}
