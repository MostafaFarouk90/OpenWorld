import type { QuestDef } from '../../../types';
import { m31 } from './m31.quest';
import { m32 } from './m32.quest';
import { m33 } from './m33.quest';
import { m34 } from './m34.quest';
import { d06 } from './d06.quest';
import { SUMMIT_PROPS } from './props';
import { SUMMIT_NOTE_LIST } from './notes';
import { SUMMIT_SPAWNERS } from './spawners';
import { SUMMIT_TRIGGERS } from './triggers';
import { SUMMIT_OBJECTIVE_FLAGS } from './objectiveFlags';
import { SUMMIT_QUEST_STRINGS } from './strings';
import { SUMMIT_ITEMS, SUMMIT_ITEM_STRINGS } from './items';

/** The five summit quests (K13 PR 2) in play order (plan Part 7.1: M31, M32, M33, M34, D06). */
export const SUMMIT_QUEST_DEFS: QuestDef[] = [m31, m32, m33, m34, d06];
export const SUMMIT_QUEST_IDS = SUMMIT_QUEST_DEFS.map((q) => q.id);

export const SUMMIT = {
  quests: SUMMIT_QUEST_DEFS,
  props: SUMMIT_PROPS,
  notes: SUMMIT_NOTE_LIST,
  carry: [] as never[],
  spawners: SUMMIT_SPAWNERS,
  triggers: SUMMIT_TRIGGERS,
  flags: SUMMIT_OBJECTIVE_FLAGS,
  strings: SUMMIT_QUEST_STRINGS,
  items: SUMMIT_ITEMS,
  itemStrings: SUMMIT_ITEM_STRINGS,
};
