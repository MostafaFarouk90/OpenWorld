// M20 Chain and Ember and D04 The Deepdelve Descent (A13), one re-export for the shared aggregates. The dialogue is
// src/dialogue/content/act2/oldsmoke/mines/m20d04.dialogue.ts.
import type { QuestDef } from '../../../../types';
import { m20 } from './m20.quest';
import { d04 } from './d04.quest';
import { M20D04_CARRY, M20D04_NOTE_LIST, M20D04_OBJECTIVE_FLAGS, M20D04_PROPS, M20D04_SPAWNERS, M20D04_TRIGGERS } from './m20d04.data';
import { M20D04_ITEM_STRINGS, M20D04_ITEMS, M20D04_QUEST_STRINGS } from './m20d04.text';
import { installD04, installM20 } from './m20d04.director';

export { m20, M20_CHAINS, M20_CHAIN_FLAGS, M20_NOTES, M20_ORSK_GONE, M20_STEWARD_TAG, M20_STEWARDS_OUT } from './m20.quest';
export { d04, D04_BOSS, D04_NOTES, D04_OUTCOME_FLAG, D04_POOL_IDS, D04_STARTED } from './d04.quest';
export { M20D04_NPC_DEFS, M20D04_NPCS, M20D04_NPC_STRINGS } from './m20d04.npcs';
export { M20D04_PACE, M20D04_LOCAL_ANCHORS } from './m20d04.pacing';
export { installD04, installM20 } from './m20d04.director';

export const M20D04_QUEST_DEFS: QuestDef[] = [m20, d04];

export const M20D04 = {
  quests: M20D04_QUEST_DEFS,
  props: M20D04_PROPS,
  notes: M20D04_NOTE_LIST,
  carry: M20D04_CARRY,
  spawners: M20D04_SPAWNERS,
  triggers: M20D04_TRIGGERS,
  /** objective-start flags (`story.m20.started`, `story.m20.stewardsOut`, D04's fight chain); `story.d04.started` is the director's */
  flags: M20D04_OBJECTIVE_FLAGS,
  strings: M20D04_QUEST_STRINGS,
  items: M20D04_ITEMS,
  itemStrings: M20D04_ITEM_STRINGS,
  director: { installM20, installD04 },
};
