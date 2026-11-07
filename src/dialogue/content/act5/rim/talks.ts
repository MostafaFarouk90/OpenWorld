// Which talk each Rim quest's talk objective plays: (quest, objective, dialogue tree, npc id, segment). The pacing test counts the
// nodes of these segments; the dialogue test checks that the start rules open them in the right state.
import { ALRIC } from '../../../../quests/content/act5/rim/m47.quest';
import { M48_GHOST } from '../../../../quests/content/act5/rim/m48.quest';
import { M49_ALLIES, M49_TABLE_DIALOGUE, M49_TABLE_NPC } from '../../../../quests/content/act5/rim/m49.quest';
import { R26_GUARD, R26_MASTER } from '../../../../quests/content/act5/rim/r26.quest';
import { R29_GHOST, R29_POSTS } from '../../../../quests/content/act5/rim/r29.quest';
import { M50_KEEPER } from '../../../../quests/content/act5/rim/m50.quest';
import { M51_CALL_DIALOGUE, M51_CALL_NPC, M51_CAPTAIN } from '../../../../quests/content/act5/rim/m51.quest';
import { M52_COMPANIONS, M52_WOUNDED_STEP } from '../../../../quests/content/act5/rim/m52.quest';

export interface TalkRow { quest: string; objective: string; tree: string; npc: string; seg: string }
const t = (quest: string, objective: string, npc: string, seg: string, tree = `npc-${npc}`): TalkRow => ({ quest, objective, tree, npc, seg });

export const RIM_A5_TALKS: readonly TalkRow[] = [
  t('m47', 'wulfhild', 'wulfhild', 'a5r-m47'),
  t('m47', 'alric', ALRIC, 'm47-alric'),
  t('m47', 'edric', 'edric', 'a5r-m47'),
  t('m47', 'rook', 'rook', 'a5r-m47'),
  t('m47', 'report', ALRIC, 'm47-report'),
  t('m48', 'brief', ALRIC, 'm48-brief'),
  t('m48', 'ghost', M48_GHOST, 'm48-ghost'),
  t('m48', 'report', ALRIC, 'm48-report'),
  t('m49', 'brief', 'hrolf', 'a5r-m49-brief'),
  ...M49_ALLIES.map((a) => t('m49', a, a, 'a5r-m49')),
  t('m49', 'maud', 'maud', 'a5r-m49'),
  t('m49', 'table', M49_TABLE_NPC, 'm49-table', M49_TABLE_DIALOGUE),
  t('m49', 'report', 'hrolf', 'a5r-m49-report'),
  t('r26', 'brief', 'merrin', 'a5r-r26-brief'),
  t('r26', 'guard', R26_GUARD(1), 'r26-guard'),
  t('r26', 'master', R26_MASTER, 'r26-master'),
  t('r26', 'report', 'merrin', 'a5r-r26-report'),
  t('r29', 'brief', 'ansgar', 'a5r-r29-brief'),
  ...R29_POSTS.map((n) => t('r29', `ghost${n}`, R29_GHOST(n), `r29-ghost${n}`)),
  t('r29', 'report', 'ansgar', 'a5r-r29-report'),
  t('m50', 'brief', ALRIC, 'm50-brief'),
  t('m50', 'keeper', M50_KEEPER, 'm50-keeper'),
  t('m50', 'report', ALRIC, 'm50-report'),
  t('m51', 'call', M51_CALL_NPC, 'm51-call', M51_CALL_DIALOGUE),
  t('m51', 'alric', ALRIC, 'm51-alric'),
  t('m51', 'edric', 'edric', 'a5r-m51'),
  t('m51', 'ysmeryth', 'ysmeryth', 'a5r-m51'),
  t('m51', 'orsk', 'orsk', 'm51-orsk'),
  t('m51', 'hathren', 'hathren', 'm51-hathren'),
  t('m51', 'captain', M51_CAPTAIN, 'm51-captain'),
  t('m51', 'report', 'ysmeryth', 'a5r-m51-report'),
  t('m52', 'brief', 'wystan', 'a5r-m52-brief'),
  t('m52', 'gate', 'wystan', 'a5r-m52-gate'),
  ...M52_COMPANIONS.map((c) => t('m52', M52_WOUNDED_STEP(c), c, 'a5r-m52-wounded', c === 'aelfreda' ? 'npc-aelfreda-companion' : `npc-${c}`)),
  t('m52', 'report', 'wystan', 'a5r-m52-report'),
];
