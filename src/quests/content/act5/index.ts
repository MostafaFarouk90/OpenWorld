// Act 5 quest aggregates (the Act 4 index's shape; N10 owns this file, coordinator ruling 4). Each Act 5 block adds its content
// here (N10's Rim, N11's Foundry); the shared registries spread these lists next to Act 4's.
import type { QuestDef } from '../../types';
import type { QuestNoteSpec } from '../../notes';
import type { Act2Note } from '../act2/notes';
import type { CarryItemSpec } from '../carry';
import { RIM_A5 } from './rim/rim.content';
import { FOUNDRY_A5 } from './foundry/foundry.content';

export { RIM_A5, RIM_A5_QUEST_IDS } from './rim/rim.content';
export { FOUNDRY_A5, FOUNDRY_A5_QUEST_IDS } from './foundry/foundry.content';

const BLOCKS = [RIM_A5, FOUNDRY_A5] as const;

export const ACT5_QUEST_DEFS: QuestDef[] = BLOCKS.flatMap((b) => b.quests);
export const ACT5_PROPS = BLOCKS.flatMap((b) => b.props);
export const ACT5_CARRY: CarryItemSpec[] = BLOCKS.flatMap((b) => b.carry);
export const ACT5_OBJECTIVE_FLAGS = BLOCKS.flatMap((b) => b.flags);
export const ACT5_NOTE_LIST: Act2Note[] = BLOCKS.flatMap((b) => b.notes);
export const ACT5_QUEST_SPAWNERS = BLOCKS.flatMap((b) => b.spawners);
export const ACT5_TRIGGERS = BLOCKS.flatMap((b) => b.triggers);
export const ACT5_QUEST_STRINGS: Record<string, string> = Object.assign({}, ...BLOCKS.map((b) => b.strings));
export const ACT5_QUEST_ITEMS = BLOCKS.flatMap((b) => b.items);
export const ACT5_QUEST_ITEM_STRINGS: Record<string, string> = Object.assign({}, ...BLOCKS.map((b) => b.itemStrings));

export const ACT5_QUEST_NOTES: QuestNoteSpec[] = ACT5_NOTE_LIST.map((x) => ({
  interactableId: `use:${x.id}`, anchorId: x.anchorId, ...(x.codexId ? { codexId: x.codexId } : {}),
}));
export const ACT5_NOTE_LOOKS: Record<string, 'page' | 'grave' | 'box'> = Object.fromEntries(ACT5_NOTE_LIST.map((x) => [`use:${x.id}`, x.look ?? 'page']));
export const ACT5_NOTE_CODEX: string[] = [...new Set(ACT5_NOTE_LIST.flatMap((n) => (n.codexId ? [n.codexId] : [])))];
