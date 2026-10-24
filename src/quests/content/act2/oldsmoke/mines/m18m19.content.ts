import type { CarryItemSpec } from '../../../carry';
import type { QuestDef } from '../../../../types';
import { m18 } from './m18.quest';
import { m19 } from './m19.quest';
import { M18M19_PROPS } from './m18m19.props';
import { M18M19_NOTE_LIST } from './m18m19.notes';
import { M18M19_SPAWNERS } from './m18m19.spawners';
import { M18M19_TRIGGERS } from './m18m19.triggers';
import { M18M19_OBJECTIVE_FLAGS } from './m18m19.flags';
import { M18M19_QUEST_STRINGS } from './m18m19.strings';
import { M18M19_ITEMS, M18M19_ITEM_STRINGS } from './m18m19.items';
import { installM18, installM19 } from './m18m19.director';

export { M18M19_NPC_DEFS, M18M19_NPCS, M18M19_NPC_STRINGS } from './m18m19.npcs';
export { M18M19_PACE, M18M19_POS, paceMinutesFollow } from './m18m19.pacing';
export { installM18, installM19, M19_INTERIOR, M18_INTERIOR, M19_GUIDE_NODE_FLAG, M19_GUIDE_BARKS_FLAG, M19_ARRIVED_FLAG } from './m18m19.director';
export type { M19Ports } from './m18m19.director';
export { WennaGuide, GUIDE, guidePoints } from './m19Route';
export { m18, m19 };

/**
 * M18 Breath for the Bellows and M19 What Grisel Hides (A13), for the integrator to spread into the Oldsmoke aggregates. The
 * director installers (`installM18(kit)`, `installM19(kit, ports?)`) are registered in the Oldsmoke director plugin; `installM19`
 * returns its disposer. Both quests grant XP only, so `items` is empty.
 */
export const M18M19 = {
  quests: [m18, m19] as QuestDef[],
  props: M18M19_PROPS,
  notes: M18M19_NOTE_LIST,
  carry: [] as CarryItemSpec[],
  spawners: M18M19_SPAWNERS,
  triggers: M18M19_TRIGGERS,
  flags: M18M19_OBJECTIVE_FLAGS,
  strings: M18M19_QUEST_STRINGS,
  items: M18M19_ITEMS,
  itemStrings: M18M19_ITEM_STRINGS,
  director: { installM18, installM19 },
};
