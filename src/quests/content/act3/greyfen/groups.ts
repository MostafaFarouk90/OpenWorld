import { M25_BEDS_FLAG } from './m25.quest';
import { R14_PACK_FLAG } from './r14.quest';
import { M26_NETGUARD_FLAG } from './m26.quest';
import { M27_PACK1_FLAG, M27_PACK2_FLAG } from './m27.quest';
import { D05_ROOM_FLAG } from './d05.quest';

/**
 * A "group objective": one objective for everything one arm puts on the field, credited when `groupStanding` reports every group
 * gone (killed, spared or calmed alike). A sequential quest credits only its current kill objective, so splitting one group into
 * per-kind kill objectives loses every kill taken out of order. The director keeps two persistent flags per row: `seen` (a member
 * was standing) and `down` (the objective's `doneWhen`, written once all groups are empty after being seen).
 */
export interface GroupObjective { quest: string; objective: string; groups: readonly string[]; armFlag: string; seen: string; down: string }

const row = (quest: string, objective: string, groups: string[], armFlag: string, name: string): GroupObjective =>
  ({ quest, objective, groups, armFlag, seen: `story.${quest}.${name}Seen`, down: `story.${quest}.${name}Down` });

export const GREYFEN_GROUP_OBJECTIVES: readonly GroupObjective[] = [
  row('m25', 'beds', ['greyfen.q.m25.shambler', 'greyfen.q.m25.leeches'], M25_BEDS_FLAG, 'beds'),
  row('r14', 'pack', ['greyfen.q.r14.pack'], R14_PACK_FLAG, 'pack'),
  row('m26', 'guards', ['greyfen.q.m26.hunters', 'greyfen.q.m26.leeches'], M26_NETGUARD_FLAG, 'guard'),
  // pack 1 is not an objective of its own: its clearing credits the reed blinds when it saw the player (M27 director)
  row('m27', 'blinds', ['greyfen.q.m27.pack1'], M27_PACK1_FLAG, 'pack1'),
  row('m27', 'pack2', ['greyfen.q.m27.pack2'], M27_PACK2_FLAG, 'pack2'),
  row('d05', 'room1', ['greyfen.q.d05.sluice-1', 'greyfen.q.d05.sluice-1.shambler'], D05_ROOM_FLAG('sluice-1'), 'room1'),
  row('d05', 'room2', ['greyfen.q.d05.sluice-2', 'greyfen.q.d05.sluice-2.shambler'], D05_ROOM_FLAG('sluice-2'), 'room2'),
];
