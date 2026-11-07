import type { QuestDef } from '../../../types';
import { m47 } from './m47.quest';
import { m48 } from './m48.quest';
import { m49 } from './m49.quest';
import { r26 } from './r26.quest';
import { r29 } from './r29.quest';
import { m50 } from './m50.quest';
import { m51 } from './m51.quest';
import { RIM_A5_PROPS } from './props';
import { RIM_A5_NOTE_LIST } from './notes';
import { RIM_A5_CARRY } from './carry';
import { RIM_A5_Q_SPAWNERS } from './spawners';
import { RIM_A5_TRIGGERS } from './triggers';
import { RIM_A5_OBJECTIVE_FLAGS } from './objectiveFlags';
import { RIM_A5_QUEST_STRINGS } from './strings';

/** The Rim quests (N10 PR 1), in plan 2.1's play order. PR 2 adds M52. */
export const RIM_A5_QUEST_DEFS: QuestDef[] = [m47, m48, m49, r26, r29, m50, m51];
export const RIM_A5_QUEST_IDS = RIM_A5_QUEST_DEFS.map((q) => q.id);

export const RIM_A5 = {
  quests: RIM_A5_QUEST_DEFS,
  props: RIM_A5_PROPS,
  notes: RIM_A5_NOTE_LIST,
  carry: RIM_A5_CARRY,
  spawners: RIM_A5_Q_SPAWNERS,
  triggers: RIM_A5_TRIGGERS,
  flags: RIM_A5_OBJECTIVE_FLAGS,
  strings: RIM_A5_QUEST_STRINGS,
  items: [] as never[],
  itemStrings: {} as Record<string, string>,
};
