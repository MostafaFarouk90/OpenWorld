import type { Q13Trigger } from '../../act2/oldsmoke/triggers';
import { Q } from './anchors';
import { M35_LANE_TRIGGER } from './m35.quest';

/** Trigger volumes of the Harrowmark quests (prefix `trg.harrowmark.a4.q.`; the director adds them). */
export const HARROWMARK_A4_TRIGGERS: Q13Trigger[] = [
  // M35: the River Gate lane; the masked men spring when the Grisel party reaches it
  { id: M35_LANE_TRIGGER, anchorId: `${Q}.m35.lane`, radius: 12 },
];
