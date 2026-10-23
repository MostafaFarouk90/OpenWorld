import type { QuestDef } from '../../../../types';
import { m17 } from './m17.quest';
import { r08 } from './r08.quest';
import { M17R08_PROPS } from './m17r08.props';
import { M17R08_NOTE_LIST } from './m17r08.notes';
import { M17R08_CARRY } from './m17r08.carry';
import { M17R08_SPAWNERS } from './m17r08.spawners';
import { M17R08_TRIGGERS } from './m17r08.triggers';
import { M17R08_OBJECTIVE_FLAGS } from './m17r08.flags';
import { M17R08_QUEST_STRINGS } from './m17r08.strings';
import { M17R08_ITEMS, M17R08_ITEM_STRINGS } from './m17r08.items';

export { M17R08_NPC_DEFS, M17R08_NPCS, M17R08_NPC_STRINGS } from './m17r08.npcs';
export { M17R08_PACE, M17R08_POS } from './m17r08.pacing';
export { m17, r08 };

/** M17 Down the Oldsmoke Shaft and R08 Pickett's Last Shift (A13), for the integrator to spread into the Oldsmoke aggregates. */
export const M17R08 = {
  quests: [m17, r08] as QuestDef[],
  props: M17R08_PROPS,
  notes: M17R08_NOTE_LIST,
  carry: M17R08_CARRY,
  spawners: M17R08_SPAWNERS,
  triggers: M17R08_TRIGGERS,
  flags: M17R08_OBJECTIVE_FLAGS,
  strings: M17R08_QUEST_STRINGS,
  items: M17R08_ITEMS,
  itemStrings: M17R08_ITEM_STRINGS,
};
