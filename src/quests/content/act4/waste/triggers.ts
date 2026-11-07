import type { Q13Trigger } from '../../act2/oldsmoke/triggers';
import { W } from './ids';
import { M42_CAMP_TRIGGER, M42_GATE_TRIGGER } from './m42.quest';
import { M46_RIM_TRIGGER } from './m46.quest';

/** Trigger volumes of the Waste quests (prefix `trg.waste.q.`; the director adds them once their anchors exist). The Storm
 * Walk's knots are added by the director from L1's knot anchors; the Glasslands, the walk's end and the cairns use L1's own triggers. */
export const WASTE_A4_TRIGGERS: Q13Trigger[] = [
  { id: M42_GATE_TRIGGER, anchorId: `${W}.m42.gate`, radius: 10 },
  { id: M42_CAMP_TRIGGER, anchorId: `${W}.m42.camp`, radius: 45 },
  { id: M46_RIM_TRIGGER, anchorId: `${W}.m46.rim`, radius: 25 },
];
