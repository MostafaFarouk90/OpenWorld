import type { GroupObjective } from '../dragonspine/groups';
import { M31_HAWKS_DOWN, M31_HAWKS_FLAG } from './m31.quest';
import { M33_PACKS_DOWN, M33_PACKS_FLAG, M33_PACK_GROUPS } from './m33.quest';
import { D06_ARM_FLAG, D06_COURTYARD_CLEAR, D06_GROUP } from './d06.quest';

export type { GroupObjective };

const row = (quest: string, objective: string, groups: string[], armFlag: string, down: string): GroupObjective =>
  ({ quest, objective, groups, armFlag, seen: `${down}.seen`, down });

/** The summit's fights as group objectives (cleared by anyone, a spared member counts as gone). `story.d06.courtyardClear` is K8's optional arm flag. */
export const SUMMIT_GROUP_OBJECTIVES: readonly GroupObjective[] = [
  row('m31', 'hawks', ['dragonspine.q.m31.hawks'], M31_HAWKS_FLAG, M31_HAWKS_DOWN),
  row('m33', 'packs', [...M33_PACK_GROUPS], M33_PACKS_FLAG, M33_PACKS_DOWN),
  row('d06', 'courtyard', [D06_GROUP], D06_ARM_FLAG, D06_COURTYARD_CLEAR),
];
