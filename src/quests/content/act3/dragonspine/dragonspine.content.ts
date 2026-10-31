import type { QuestDef } from '../../../types';
import { m28 } from './m28.quest';
import { r15 } from './r15.quest';
import { m29 } from './m29.quest';
import { r16 } from './r16.quest';
import { m30 } from './m30.quest';
import { r17 } from './r17.quest';
import { r18 } from './r18.quest';
import { DRAGONSPINE_PROPS } from './props';
import { DRAGONSPINE_NOTE_LIST } from './notes';
import { DRAGONSPINE_SPAWNERS } from './spawners';
import { DRAGONSPINE_TRIGGERS } from './triggers';
import { DRAGONSPINE_OBJECTIVE_FLAGS } from './objectiveFlags';
import { DRAGONSPINE_QUEST_STRINGS } from './strings';
import { DRAGONSPINE_ITEMS, DRAGONSPINE_ITEM_STRINGS } from './items';

/** The seven lower Dragonspine quests (K13 PR 1) in play order (plan Part 7.1: M28, R15, M29, R16, M30, R17, R18). */
export const DRAGONSPINE_QUEST_DEFS: QuestDef[] = [m28, r15, m29, r16, m30, r17, r18];
export const DRAGONSPINE_QUEST_IDS = DRAGONSPINE_QUEST_DEFS.map((q) => q.id);

export const DRAGONSPINE_LOWER = {
  quests: DRAGONSPINE_QUEST_DEFS,
  props: DRAGONSPINE_PROPS,
  notes: DRAGONSPINE_NOTE_LIST,
  carry: [] as never[],
  spawners: DRAGONSPINE_SPAWNERS,
  triggers: DRAGONSPINE_TRIGGERS,
  flags: DRAGONSPINE_OBJECTIVE_FLAGS,
  strings: DRAGONSPINE_QUEST_STRINGS,
  items: DRAGONSPINE_ITEMS,
  itemStrings: DRAGONSPINE_ITEM_STRINGS,
};
