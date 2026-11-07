// The arms (a spawner group is switched on when its step is current, never on accept) and the group objectives (one `down` flag
// per row, written when every group of the row is empty after a member was seen) of the Rim quests, in L10's shapes. R26's
// ambushes are armed by distance on the fast road (convoy.ts), so they have group rows but no arm rows.
import type { Arm, GroupObjective } from '../../../act4/harrowmark/director/tables';
import { M47_ARM, M48_ARM } from '../spawners';
import { M47_DOWN, M47_GROUPS } from '../m47.quest';
import { M48_DOWN, M48_GROUPS } from '../m48.quest';
import { R26_AMBUSH, R26_AMBUSH_ARM, R26_AMBUSH_DOWN } from '../r26.quest';
import { R29_DEAD, R29_DEAD_ARM, R29_DEAD_DOWN, R29_POSTS } from '../r29.quest';
import { M50_GNATS, M50_GOLEMS, M50_GOLEMS_ARM, M50_GOLEMS_DOWN } from '../m50.quest';
import { M51_SCOUTS, M51_SCOUTS_ARM, M51_SCOUTS_DOWN } from '../m51.quest';

const CHAMBERS = [2, 3, 4] as const;

export const RIM_A5_ARMS: readonly Arm[] = [
  { quest: 'm47', objective: 'knot1', flag: M47_ARM.knot1 },
  { quest: 'm47', objective: 'knot2', flag: M47_ARM.knot2 },
  { quest: 'm48', objective: 'golems', flag: M48_ARM.golems },
  { quest: 'm48', objective: 'gnats', flag: M48_ARM.gnats },
  ...R29_POSTS.map((n): Arm => ({ quest: 'r29', objective: `dead${n}`, flag: R29_DEAD_ARM(n) })),
  ...CHAMBERS.map((c): Arm => ({ quest: 'm50', objective: `golems${c}`, flag: M50_GOLEMS_ARM(c) })),
  { quest: 'm51', objective: 'scouts', flag: M51_SCOUTS_ARM },
];

const row = (quest: string, objective: string, groups: readonly string[], armFlag: string, down: string): GroupObjective =>
  ({ quest, objective, groups, armFlag, seen: `${down}.seen`, down });

export const RIM_A5_GROUPS: readonly GroupObjective[] = [
  row('m47', 'knot1', [M47_GROUPS.knot1], M47_ARM.knot1, M47_DOWN.knot1),
  row('m47', 'knot2', [M47_GROUPS.knot2], M47_ARM.knot2, M47_DOWN.knot2),
  row('m48', 'golems', [M48_GROUPS.golems], M48_ARM.golems, M48_DOWN.golems),
  row('m48', 'gnats', [M48_GROUPS.gnats], M48_ARM.gnats, M48_DOWN.gnats),
  ...([1, 2] as const).map((n) => row('r26', `ambush${n}`, [R26_AMBUSH[n - 1]!], R26_AMBUSH_ARM(n), R26_AMBUSH_DOWN(n))),
  ...R29_POSTS.map((n) => row('r29', `dead${n}`, [R29_DEAD(n)], R29_DEAD_ARM(n), R29_DEAD_DOWN(n))),
  // the third chamber's gnats wake with its golems and must go down with them
  row('m50', 'golems2', [M50_GOLEMS(2)], M50_GOLEMS_ARM(2), M50_GOLEMS_DOWN(2)),
  row('m50', 'golems3', [M50_GOLEMS(3), M50_GNATS], M50_GOLEMS_ARM(3), M50_GOLEMS_DOWN(3)),
  row('m50', 'golems4', [M50_GOLEMS(4)], M50_GOLEMS_ARM(4), M50_GOLEMS_DOWN(4)),
  row('m51', 'scouts', [...M51_SCOUTS], M51_SCOUTS_ARM, M51_SCOUTS_DOWN),
];
