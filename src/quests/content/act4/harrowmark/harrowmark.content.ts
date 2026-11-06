import type { QuestDef } from '../../../types';
import { m35 } from './m35.quest';
import { m36 } from './m36.quest';
import { r19 } from './r19.quest';
import { r20 } from './r20.quest';
import { r21 } from './r21.quest';
import { r22 } from './r22.quest';
import { r23 } from './r23.quest';
import { d07 } from './d07.quest';
import { m37 } from './m37.quest';
import { m38 } from './m38.quest';
import { m39 } from './m39.quest';
import { m40 } from './m40.quest';
import { m41 } from './m41.quest';
import { HARROWMARK_A4_PROPS } from './props';
import { HARROWMARK_A4_NOTE_LIST } from './notes';
import { HARROWMARK_A4_Q_SPAWNERS } from './spawners';
import { HARROWMARK_A4_TRIGGERS } from './triggers';
import { HARROWMARK_A4_OBJECTIVE_FLAGS } from './objectiveFlags';
import { HARROWMARK_A4_QUEST_STRINGS } from './strings';
import { HARROWMARK_A4_ITEMS, HARROWMARK_A4_ITEM_STRINGS } from './items';

/** The Harrowmark quests (L10): before the Council (PR 1) in plan 2.1's recommended order, then the betrayal and the flight (PR 2). */
export const HARROWMARK_A4_QUEST_DEFS: QuestDef[] = [m35, m36, r19, r20, r21, r22, r23, d07, m37, m38, m39, m40, m41];
export const HARROWMARK_A4_QUEST_IDS = HARROWMARK_A4_QUEST_DEFS.map((q) => q.id);

export const HARROWMARK_A4 = {
  quests: HARROWMARK_A4_QUEST_DEFS,
  props: HARROWMARK_A4_PROPS,
  notes: HARROWMARK_A4_NOTE_LIST,
  carry: [] as never[],
  spawners: HARROWMARK_A4_Q_SPAWNERS,
  triggers: HARROWMARK_A4_TRIGGERS,
  flags: HARROWMARK_A4_OBJECTIVE_FLAGS,
  strings: HARROWMARK_A4_QUEST_STRINGS,
  items: HARROWMARK_A4_ITEMS,
  itemStrings: HARROWMARK_A4_ITEM_STRINGS,
};
