import type { Q13Trigger } from '../../act2/oldsmoke/triggers';
import { M27_BLINDS_END } from './m27.quest';

/** Trigger volumes of the Greyfen quests (prefix `trg.greyfen.`, the director adds them): the far end of the reed blinds. */
export const GREYFEN_TRIGGERS: Q13Trigger[] = [
  { id: M27_BLINDS_END, anchorId: 'greyfen.m27.blind.4', radius: 8 },
];
