// The arms (a spawner group is switched on when its step is current, never on accept) and the group objectives (one `down`
// flag per row, written when every group of the row is empty after a member was seen) of the Harrowmark quests.
import { ACT4_SPAWN_FLAGS } from '../../../../../harrowmark/act4/spawners';
import { M35_AMBUSH_DOWN, M35_AMBUSH_FLAG, M35_AMBUSH_GROUPS } from '../m35.quest';
import { M36_DAGGERMAN_DOWN, M36_DAGGERMAN_FLAG, M36_DAGGERMAN_GROUPS, M36_ROOFTOPS_FLAG } from '../m36.quest';
import { R19_DESERTER_GROUPS, R19_DESERTERS_DOWN, R19_DESERTERS_FLAG } from '../r19.quest';
import { R20_FORCE_GROUP, R20_PASSED } from '../r20.quest';
import { R21_PATROL_DOWN, R21_PATROL_GROUPS } from '../r21.quest';
import { R22_ARM, R22_DOWN, R22_GROUP, R22_SITES } from '../r22.quest';
import { R23_FORGER_DOWN, R23_FORGER_FLAG, R23_FORGER_GROUPS } from '../r23.quest';
import { D07_ENTERED, D07_FORGE, D07_FORGE_DOWN, D07_HALLS, D07_HALLS_DOWN } from '../d07.quest';
import { R21_WATCH_FLAG } from '../spawners';
import { M38_CHAMBER_DOWN, M38_CHAMBER_GROUP } from '../m38.quest';
import { M39_GUARD, M39_HELD, M39_STAIRHEAD, M39_STAIRHEAD_DOWN } from '../m39.quest';
import { M40_DEN_DOWN, M40_DENS, M40_ENTERED } from '../m40.quest';
import { M38_CHAMBER_SPAWNED, M39_GUARD_SPAWNED, M39_STAIRHEAD_SPAWNED } from './council';

export interface Arm { quest: string; objective: string; flag: string }
export interface GroupObjective { quest: string; objective: string; groups: readonly string[]; armFlag: string; seen: string; down: string }

/** R20's force and stealth arms depend on the way chosen, so the director arms those itself (see quests.ts). */
export const HARROWMARK_A4_ARMS: readonly Arm[] = [
  { quest: 'm36', objective: 'rooftops', flag: M36_ROOFTOPS_FLAG },
  { quest: 'm36', objective: 'daggerman', flag: M36_DAGGERMAN_FLAG },
  { quest: 'r19', objective: 'deserters', flag: R19_DESERTERS_FLAG },
  { quest: 'r21', objective: 'lanes', flag: R21_WATCH_FLAG },
  ...R22_SITES.map((s): Arm => ({ quest: 'r22', objective: `${s.id}Guards`, flag: R22_ARM(s) })),
  { quest: 'r23', objective: 'forger', flag: R23_FORGER_FLAG },
];

const row = (quest: string, objective: string, groups: readonly string[], armFlag: string, down: string): GroupObjective =>
  ({ quest, objective, groups, armFlag, seen: `${down}.seen`, down });

export const HARROWMARK_A4_GROUPS: readonly GroupObjective[] = [
  row('m35', 'ambush', M35_AMBUSH_GROUPS, M35_AMBUSH_FLAG, M35_AMBUSH_DOWN),
  row('m36', 'daggerman', M36_DAGGERMAN_GROUPS, M36_DAGGERMAN_FLAG, M36_DAGGERMAN_DOWN),
  row('r19', 'deserters', R19_DESERTER_GROUPS, R19_DESERTERS_FLAG, R19_DESERTERS_DOWN),
  // R20's force branch: each post is passed when its group is down (the flag is the post's own `passed`)
  ...[1, 2, 3].map((n) => row('r20', `cp${n}`, [R20_FORCE_GROUP(n)], ACT4_SPAWN_FLAGS.r20Force(n), R20_PASSED(n))),
  // L2's cellar patrol comes up with R21 itself (no flag): armed by the quest's own started flag
  row('r21', 'patrol', R21_PATROL_GROUPS, 'story.r21.started', R21_PATROL_DOWN),
  ...R22_SITES.map((s) => row('r22', `${s.id}Guards`, [R22_GROUP(s)], R22_ARM(s), R22_DOWN(s))),
  row('r23', 'forger', R23_FORGER_GROUPS, R23_FORGER_FLAG, R23_FORGER_DOWN),
  row('d07', 'halls', D07_HALLS, D07_ENTERED, D07_HALLS_DOWN),
  row('d07', 'forge', D07_FORGE, D07_ENTERED, D07_FORGE_DOWN),
  // PR 2: the betrayal's six, the stair head and the champion's guard (all spawned by the director), the two hound dens (live on entering the deep run)
  row('m38', 'fight', [M38_CHAMBER_GROUP], M38_CHAMBER_SPAWNED, M38_CHAMBER_DOWN),
  row('m39', 'stairhead', [M39_STAIRHEAD], M39_STAIRHEAD_SPAWNED, M39_STAIRHEAD_DOWN),
  row('m39', 'hold', [M39_GUARD], M39_GUARD_SPAWNED, M39_HELD),
  row('m40', 'den1', [M40_DENS[0]], M40_ENTERED, M40_DEN_DOWN(1)),
  row('m40', 'den2', [M40_DENS[1]], M40_ENTERED, M40_DEN_DOWN(2)),
];
