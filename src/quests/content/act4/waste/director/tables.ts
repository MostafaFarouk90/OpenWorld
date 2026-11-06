// The arms (a spawner group is switched on when its step is current, never on accept) and the group objectives (one `down`
// flag per row, written when every group of the row is empty after a member was seen) of the Waste quests. The rows use L10's
// shapes, so L10's installers run them unchanged.
import type { Arm, GroupObjective } from '../../harrowmark/director/tables';
import { M42_ARM } from '../spawners';
import { M42_DOWN, M42_GROUPS } from '../m42.quest';
import { M44_NEST_ARM, M44_NEST_DOWN, M44_NEST_GROUP } from '../m44.quest';
import { R25_KNOT_ARM, R25_KNOT_DOWN, R25_KNOT_GROUP } from '../r25.quest';
import { M45_GUARD_ARM, M45_GUARD_DOWN, M45_GUARD_GROUP } from '../m45.quest';
import { D08_ENTERED, D08_KNIGHTS, D08_KNIGHTS_DOWN } from '../d08.quest';
import { M46_OUTRIDERS, M46_OUTRIDERS_ARM, M46_OUTRIDERS_DOWN } from '../m46.quest';

export const WASTE_A4_ARMS: readonly Arm[] = [
  { quest: 'm42', objective: 'striders', flag: M42_ARM.striders },
  { quest: 'm42', objective: 'wraiths', flag: M42_ARM.wraiths },
  { quest: 'm44', objective: 'nest', flag: M44_NEST_ARM },
  { quest: 'r25', objective: 'knot', flag: R25_KNOT_ARM },
  { quest: 'm45', objective: 'guard', flag: M45_GUARD_ARM },
  { quest: 'm46', objective: 'outriders', flag: M46_OUTRIDERS_ARM },
];

const row = (quest: string, objective: string, groups: readonly string[], armFlag: string, down: string): GroupObjective =>
  ({ quest, objective, groups, armFlag, seen: `${down}.seen`, down });

export const WASTE_A4_GROUPS: readonly GroupObjective[] = [
  row('m42', 'striders', [M42_GROUPS.striders], M42_ARM.striders, M42_DOWN.striders),
  row('m42', 'wraiths', [M42_GROUPS.wraiths], M42_ARM.wraiths, M42_DOWN.wraiths),
  row('m44', 'nest', [M44_NEST_GROUP], M44_NEST_ARM, M44_NEST_DOWN),
  row('r25', 'knot', [R25_KNOT_GROUP], R25_KNOT_ARM, R25_KNOT_DOWN),
  row('m45', 'guard', [M45_GUARD_GROUP], M45_GUARD_ARM, M45_GUARD_DOWN),
  // the narthex's knights and husks come up on entering (the spawners read `story.d08.entered`)
  row('d08', 'knights', D08_KNIGHTS, D08_ENTERED, D08_KNIGHTS_DOWN),
  row('m46', 'outriders', M46_OUTRIDERS, M46_OUTRIDERS_ARM, M46_OUTRIDERS_DOWN),
];
