import type { QuestDef } from '../../../types';
import { m42 } from './m42.quest';
import { m43 } from './m43.quest';
import { m44 } from './m44.quest';
import { r25 } from './r25.quest';
import { r24 } from './r24.quest';
import { m45 } from './m45.quest';
import { d08 } from './d08.quest';
import { m46 } from './m46.quest';
import { WASTE_A4_PROPS } from './props';
import { WASTE_A4_NOTE_LIST } from './notes';
import { WASTE_A4_Q_SPAWNERS } from './spawners';
import { WASTE_A4_TRIGGERS } from './triggers';
import { WASTE_A4_OBJECTIVE_FLAGS } from './objectiveFlags';
import { WASTE_A4_QUEST_STRINGS } from './strings';
import { WASTE_A4_ITEMS, WASTE_A4_ITEM_STRINGS } from './items';

/** The Waste quests (L11), in plan 2.3's play order. */
export const WASTE_A4_QUEST_DEFS: QuestDef[] = [m42, m43, m44, r25, r24, m45, d08, m46];
export const WASTE_A4_QUEST_IDS = WASTE_A4_QUEST_DEFS.map((q) => q.id);

export const WASTE_A4 = {
  quests: WASTE_A4_QUEST_DEFS,
  props: WASTE_A4_PROPS,
  notes: WASTE_A4_NOTE_LIST,
  carry: [] as never[],
  spawners: WASTE_A4_Q_SPAWNERS,
  triggers: WASTE_A4_TRIGGERS,
  flags: WASTE_A4_OBJECTIVE_FLAGS,
  strings: WASTE_A4_QUEST_STRINGS,
  items: WASTE_A4_ITEMS,
  itemStrings: WASTE_A4_ITEM_STRINGS,
};
