import { M28_CRAG_DOWN, M28_CRAG_FLAG } from './m28.quest';
import { M29_HAWKS_DOWN, M29_HAWKS_FLAG } from './m29.quest';
import { R16_PACK_DOWN, R16_PACK_FLAG } from './r16.quest';
import { M30_PACK_DOWN, M30_PACK_FLAG } from './m30.quest';

/**
 * A "group objective": one objective for everything one arm puts on the field, credited when `groupStanding` reports every group
 * gone (killed, spared or calmed alike). The director keeps two persistent flags per row: `seen` (a member was standing) and
 * `down` (the objective's `doneWhen`, written once all groups are empty after being seen). A group whose enemy kind has no
 * behaviour registered yet (K6b PR 2 is not merged) is read as seen and gone the moment it is armed, so the quest stays finishable.
 */
export interface GroupObjective { quest: string; objective: string; groups: readonly string[]; armFlag: string; seen: string; down: string }

const row = (quest: string, objective: string, groups: string[], armFlag: string, down: string): GroupObjective =>
  ({ quest, objective, groups, armFlag, seen: `${down}.seen`, down });

export const DRAGONSPINE_GROUP_OBJECTIVES: readonly GroupObjective[] = [
  row('m28', 'crag', ['dragonspine.q.m28.crag'], M28_CRAG_FLAG, M28_CRAG_DOWN),
  row('m29', 'hawks', ['dragonspine.q.m29.hawks'], M29_HAWKS_FLAG, M29_HAWKS_DOWN),
  row('r16', 'pack', ['dragonspine.q.r16.pack'], R16_PACK_FLAG, R16_PACK_DOWN),
  row('m30', 'pack', ['dragonspine.q.m30.shoulder'], M30_PACK_FLAG, M30_PACK_DOWN),
];
