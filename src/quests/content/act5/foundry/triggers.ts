import type { Q13Trigger } from '../../act2/oldsmoke/triggers';
import { FA, R28_PYRE_AT } from './anchors';
import { M53_GATE_TRIGGER } from './m53.quest';
import { FT } from './ids';

/** R28: a token is carried into its pyre's trigger. */
export const R28_PYRE_TRIGGER = (n: number): string => `${FT}.r28.pyre.${n}`;

/** Trigger volumes of the Foundry quests (the director adds them once their anchors exist). Interiors use N2's triggers. */
export const FOUNDRY_A5_TRIGGERS: Q13Trigger[] = [
  ...R28_PYRE_AT.map((_, i) => ({ id: R28_PYRE_TRIGGER(i + 1), anchorId: FA.pyre(i + 1), radius: 3 })),
  { id: M53_GATE_TRIGGER, anchorId: FA.m53Truce, radius: 14 },
];
