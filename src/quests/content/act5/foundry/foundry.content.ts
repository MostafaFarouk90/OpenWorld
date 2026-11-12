import type { QuestDef } from '../../../types';
import { r27 } from './r27.quest';
import { r28 } from './r28.quest';
import { r30 } from './r30.quest';
import { m53 } from './m53.quest';
import { d09 } from './d09.quest';
import { m54 } from './m54.quest';
import { m55 } from './m55.quest';
import { d10 } from './d10.quest';
import { m56 } from './m56.quest';
import { FOUNDRY_A5_PROPS } from './props';
import { FOUNDRY_A5_NOTE_LIST } from './notes';
import { FOUNDRY_A5_Q_SPAWNERS } from './spawners';
import { FOUNDRY_A5_TRIGGERS } from './triggers';
import { FOUNDRY_A5_OBJECTIVE_FLAGS } from './objectiveFlags';
import { FOUNDRY_A5_QUEST_STRINGS } from './strings';
import { FOUNDRY_A5_CARRY } from './carry';

/** The Foundry and Anvil quests (N11), in plan 2.2's play order. PR 1: R27, R28, R30, M53, D09; PR 2: M54, M55, D10, M56. */
export const FOUNDRY_A5_QUEST_DEFS: QuestDef[] = [r27, r28, r30, m53, d09, m54, m55, d10, m56];
export const FOUNDRY_A5_QUEST_IDS = FOUNDRY_A5_QUEST_DEFS.map((q) => q.id);

export const FOUNDRY_A5 = {
  quests: FOUNDRY_A5_QUEST_DEFS,
  props: FOUNDRY_A5_PROPS,
  notes: FOUNDRY_A5_NOTE_LIST,
  carry: FOUNDRY_A5_CARRY,
  spawners: FOUNDRY_A5_Q_SPAWNERS,
  triggers: FOUNDRY_A5_TRIGGERS,
  flags: FOUNDRY_A5_OBJECTIVE_FLAGS,
  strings: FOUNDRY_A5_QUEST_STRINGS,
  items: [] as never[],
  itemStrings: {} as Record<string, string>,
};
