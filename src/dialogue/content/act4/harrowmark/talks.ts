// Which talk each Harrowmark quest's talk objective plays: (quest, objective, dialogue tree, segment). The pacing test counts the
// nodes of these segments; the dialogue test checks that the start rules open them in the right state.
import { M35_GUARD, M35_HOUSES, M35_LEAD } from '../../../../quests/content/act4/harrowmark/m35.quest';
import { M36_DELEGATE_NPC, M36_DAGGER_SCENE } from '../../../../quests/content/act4/harrowmark/m36.quest';
import { R19_CAPTAINS } from '../../../../quests/content/act4/harrowmark/r19.quest';
import { R21_KEEPER } from '../../../../quests/content/act4/harrowmark/r21.quest';
import { R22_SITES } from '../../../../quests/content/act4/harrowmark/r22.quest';
import { R23_WITNESSES } from '../../../../quests/content/act4/harrowmark/r23.quest';
import { D07_CAPTIVE } from '../../../../quests/content/act4/harrowmark/d07.quest';
import { M38_CASE_SCENE } from '../../../../quests/content/act4/harrowmark/m38.quest';
import { M37_BOND_SCENE, M37_COMPANIONS, M37_END_SCENE } from '../../../../quests/content/act4/harrowmark/m37.quest';

export interface TalkRow { quest: string; objective: string; tree: string; seg: string; flags?: Record<string, string | boolean> }

const t = (quest: string, objective: string, tree: string, seg: string, flags?: TalkRow['flags']): TalkRow => ({ quest, objective, tree, seg, ...(flags ? { flags } : {}) });
const LEAD_SEG: Record<string, string> = { merrin: 'a4-m35-oswin', 'aldric-cole': 'm35-halvard', 'grisel-steward': 'a4-m35-grisel' };

export const HARROWMARK_A4_TALKS: readonly TalkRow[] = [
  t('m35', 'brief', 'npc-wystan', 'a4-m35-brief'),
  ...M35_HOUSES.flatMap((h) => [t('m35', h, `npc-${M35_LEAD[h]}`, LEAD_SEG[M35_LEAD[h]]!), t('m35', `${h}Pass`, `npc-${M35_GUARD(h)}`, 'm35-pass')]),
  t('m35', 'report', 'npc-wystan', 'a4-m35-report'),
  t('m36', 'brief', 'npc-merrin', 'a4-m36-brief'),
  t('m36', 'halvard', `npc-${M36_DELEGATE_NPC.halvard}`, 'm36-halvard'),
  t('m36', 'oswin', `npc-${M36_DELEGATE_NPC.oswin}`, 'm36-oswin'),
  t('m36', 'dagger', M36_DAGGER_SCENE, 'scene'),
  t('m36', 'grisel', `npc-${M36_DELEGATE_NPC.grisel}`, 'a4-m36-grisel'),
  t('m36', 'report', 'npc-merrin', 'a4-m36-report'),
  t('r19', 'brief', 'npc-wystan', 'a4-r19-brief'),
  ...R19_CAPTAINS.map((c) => t('r19', c.id, `npc-${c.npc}`, 'r19')),
  t('r19', 'report', 'npc-wystan', 'a4-r19-report'),
  t('r20', 'brief', 'npc-merrin', 'a4-r20-brief'),
  t('r20', 'report', 'npc-merrin', 'a4-r20-report'),
  t('r21', 'brief', 'npc-wenna', 'a4-r21-brief'),
  t('r21', 'keeper', `npc-${R21_KEEPER}`, 'r21'),
  t('r21', 'report', 'npc-wenna', 'a4-r21-report'),
  t('r22', 'brief', 'npc-dunstan', 'a4-r22-brief'),
  ...R22_SITES.map((s) => t('r22', `${s.id}Talk`, `npc-${s.local}`, 'r22')),
  t('r22', 'bring', 'npc-dunstan', 'a4-r22-bring'),
  t('r22', 'choose', 'npc-dunstan', 'a4-r22-choose'),
  t('r23', 'brief', 'npc-rook', 'a4-r23-brief'),
  ...R23_WITNESSES.map((w, i) => t('r23', `w${i + 1}`, `npc-${w}`, 'r23')),
  t('r23', 'choose', 'npc-rook', 'a4-r23-choose'),
  t('r23', 'report', 'npc-rook', 'a4-r23-report'),
  t('d07', 'brief', 'npc-rook', 'a4-d07-brief'),
  t('d07', 'captive', `npc-${D07_CAPTIVE}`, 'd07'),
  t('d07', 'report', 'npc-rook', 'a4-d07-report'),
  t('m37', 'brief', 'npc-tobb', 'a4-m37-brief'),
  ...M37_COMPANIONS.map((c) => t('m37', c, M37_BOND_SCENE(c), 'scene')),
  t('m37', 'gaut', 'npc-gaut', 'a4-m37-gaut'),
  t('m37', 'toast', M37_END_SCENE, 'scene'),
  // PR 2
  t('m38', 'brief', 'npc-edric', 'a4-m38-brief'),
  ...(['wystan', 'merrin', 'wenna'] as const).map((id) => t('m38', id, `npc-${id}`, `a4-m38-${id}`)),
  t('m38', 'case', M38_CASE_SCENE, 'scene'),
  t('m38', 'rally', 'npc-edric', 'a4-m38-rally'),
  t('m39', 'gaut', 'npc-gaut', 'a4-m39-gaut'),
  t('m39', 'edric', 'npc-edric', 'a4-m39-edric'),
  t('m40', 'brief', 'npc-rook', 'a4-m40-brief'),
  t('m41', 'edric', 'npc-edric', 'a4-m41-edric'),
  t('m41', 'rook', 'npc-rook', 'a4-m41-rook'),
  t('m41', 'wystan', 'npc-wystan', 'a4-m41-wystan'),
  t('m41', 'ashgate', 'npc-edric', 'a4-m41-ashgate'),
];
