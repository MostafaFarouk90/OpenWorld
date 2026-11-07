// Which talk each Waste quest's talk objective plays: (quest, objective, dialogue tree, segment). The pacing test counts the
// nodes of these segments; the dialogue test checks that the start rules open them in the right state.
import { HILD } from '../../../../quests/content/act4/waste/m42.quest';
import { M43_MASTER, M43_TRIALS } from '../../../../quests/content/act4/waste/m43.quest';
import { CHAPEL_KEEPER, EBBA } from '../../../../quests/content/act4/waste/m44.quest';
import { R24_CARTER } from '../../../../quests/content/act4/waste/r24.quest';
import { D08_DYING } from '../../../../quests/content/act4/waste/d08.quest';
import { M46_KEEPER } from '../../../../quests/content/act4/waste/m46.quest';

export interface TalkRow { quest: string; objective: string; tree: string; seg: string }
const t = (quest: string, objective: string, tree: string, seg: string): TalkRow => ({ quest, objective, tree, seg });
const WU = 'npc-wulfhild';

export const WASTE_A4_TALKS: readonly TalkRow[] = [
  t('m42', 'brief', WU, 'm42-brief'),
  t('m42', 'clip', `npc-${HILD}`, 'm42-clip'),
  t('m42', 'report', WU, 'm42-report'),
  t('m43', 'brief', WU, 'm43-brief'),
  ...M43_TRIALS.map((x) => t('m43', `${x}Talk`, `npc-${M43_MASTER[x]}`, `m43-${x}`)),
  t('m43', 'welcome', WU, 'm43-welcome'),
  t('m44', 'brief', `npc-${EBBA}`, 'm44-brief'),
  t('m44', 'keeper', `npc-${CHAPEL_KEEPER}`, 'm44-keeper'),
  t('m44', 'report', `npc-${EBBA}`, 'm44-report'),
  t('r25', 'brief', `npc-${EBBA}`, 'r25-brief'),
  t('r25', 'report', `npc-${EBBA}`, 'r25-report'),
  t('r24', 'brief', WU, 'r24-brief'),
  t('r24', 'carter', `npc-${R24_CARTER}`, 'r24-carter'),
  t('m45', 'brief', WU, 'm45-brief'),
  t('m45', 'report', WU, 'm45-report'),
  t('d08', 'brief', WU, 'd08-brief'),
  t('d08', 'dying', `npc-${D08_DYING}`, 'd08-dying'),
  t('d08', 'report', WU, 'd08-report'),
  t('m46', 'brief', 'npc-hrolf', 'a4w-m46-brief'),
  ...[1, 2, 3].map((n) => t('m46', `keeper${n}`, `npc-${M46_KEEPER(n)}`, `m46-keeper${n}`)),
  t('m46', 'report', 'npc-hrolf', 'a4w-m46-report'),
];
