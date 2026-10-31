import type { QuestDef } from '../../../types';
import { m23 } from './m23.quest';
import { m24 } from './m24.quest';
import { r12 } from './r12.quest';
import { m25 } from './m25.quest';
import { r14 } from './r14.quest';
import { r13 } from './r13.quest';
import { m26 } from './m26.quest';
import { m27 } from './m27.quest';
import { d05 } from './d05.quest';
import { GREYFEN_PROPS } from './props';
import { GREYFEN_NOTE_LIST } from './notes';
import { GREYFEN_SPAWNERS } from './spawners';
import { GREYFEN_TRIGGERS } from './triggers';
import { GREYFEN_OBJECTIVE_FLAGS } from './objectiveFlags';
import { GREYFEN_QUEST_STRINGS } from './strings';
import { GREYFEN_ITEMS, GREYFEN_ITEM_STRINGS } from './items';

/** The nine Greyfen quests (K12) in play order (plan Part 7.1: M23, M24, R12, M25, R14, R13, M26, M27, D05). */
export const GREYFEN_QUEST_DEFS: QuestDef[] = [m23, m24, r12, m25, r14, r13, m26, m27, d05];
export const GREYFEN_QUEST_IDS = GREYFEN_QUEST_DEFS.map((q) => q.id);

export const GREYFEN = {
  quests: GREYFEN_QUEST_DEFS,
  props: GREYFEN_PROPS,
  notes: GREYFEN_NOTE_LIST,
  carry: [] as never[],
  spawners: GREYFEN_SPAWNERS,
  triggers: GREYFEN_TRIGGERS,
  flags: GREYFEN_OBJECTIVE_FLAGS,
  strings: GREYFEN_QUEST_STRINGS,
  items: GREYFEN_ITEMS,
  itemStrings: GREYFEN_ITEM_STRINGS,
};
