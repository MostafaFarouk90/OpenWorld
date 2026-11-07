// The arms (a spawner group is switched on when its step is current, never on accept) and the group objectives (one `down`
// flag per row) of the Foundry quests, in L10's shapes so L10's installers run them unchanged. M53's and D09's guards are
// armed by the director (they read F1 and Wenna's talk), so only their group rows are here.
import type { Arm, GroupObjective } from '../../../act4/harrowmark/director/tables';
import { D09_GUARDS_ARM, D09_GUARDS_DOWN, D09_PATROL_ARM, D09_PATROL_DOWN, M53_BROKEN_ARM, M53_BROKEN_DOWN, R28_RISEN_ARM, R28_RISEN_DOWN } from '../flags';
import { M53_GROUPS } from '../m53.quest';
import { R28_GROUP, R28_RISERS } from '../r28.quest';
import { D09_GUARD_PAIRS, D09_PATROL_IDS, D09_VAT_IDS, M53_PICKET_IDS } from '../spawners';

export const M53_PICKETS_ARM = `${M53_BROKEN_ARM}.pickets`;

export const FOUNDRY_A5_ARMS: readonly Arm[] = [
  ...R28_RISERS.map((n): Arm => ({ quest: 'r28', objective: `risen${n}`, flag: R28_RISEN_ARM(n) })),
  { quest: 'd09', objective: 'patrol', flag: D09_PATROL_ARM },
];

const row = (quest: string, objective: string, groups: readonly string[], armFlag: string, down: string): GroupObjective =>
  ({ quest, objective, groups, armFlag, seen: `${down}.seen`, down });

export const FOUNDRY_A5_GROUPS: readonly GroupObjective[] = [
  ...R28_RISERS.map((n) => row('r28', `risen${n}`, [R28_GROUP(n)], R28_RISEN_ARM(n), R28_RISEN_DOWN(n))),
  // F1 Confront arms the loyalists, Spy the pickets: whichever is armed writes the one `down`
  row('m53', 'broken', [M53_GROUPS.loyalists], M53_BROKEN_ARM, M53_BROKEN_DOWN),
  row('m53', 'broken', M53_PICKET_IDS, M53_PICKETS_ARM, M53_BROKEN_DOWN),
  row('d09', 'patrol', D09_PATROL_IDS, D09_PATROL_ARM, D09_PATROL_DOWN),
  // the vat patrol and the guard pairs Wenna did not turn (a turned pair is never armed, so it stands at zero)
  row('d09', 'guards', [...D09_VAT_IDS, ...D09_GUARD_PAIRS], D09_GUARDS_ARM, D09_GUARDS_DOWN),
];
