// Act 4 quest aggregates (the Act 3 index's shape). Each Act 4 block adds its content here; the shared registries spread these
// lists next to Act 3's.
import type { QuestDef } from '../../types';
import type { QuestNoteSpec } from '../../notes';
import type { Act2Note } from '../act2/notes';
import type { CarryItemSpec } from '../carry';
import './harrowmark/items';
import { HARROWMARK_A4 } from './harrowmark/harrowmark.content';
import { WASTE_A4 } from './waste/waste.content';

export { HARROWMARK_A4, HARROWMARK_A4_QUEST_IDS } from './harrowmark/harrowmark.content';
export { WASTE_A4, WASTE_A4_QUEST_IDS } from './waste/waste.content';

const BLOCKS = [HARROWMARK_A4, WASTE_A4] as const;

export const ACT4_QUEST_DEFS: QuestDef[] = BLOCKS.flatMap((b) => b.quests);
export const ACT4_PROPS = BLOCKS.flatMap((b) => b.props);
export const ACT4_CARRY: CarryItemSpec[] = BLOCKS.flatMap((b) => b.carry);
export const ACT4_OBJECTIVE_FLAGS = BLOCKS.flatMap((b) => b.flags);
export const ACT4_NOTE_LIST: Act2Note[] = BLOCKS.flatMap((b) => b.notes);
export const ACT4_QUEST_SPAWNERS = BLOCKS.flatMap((b) => b.spawners);
export const ACT4_TRIGGERS = BLOCKS.flatMap((b) => b.triggers);
export const ACT4_QUEST_STRINGS: Record<string, string> = Object.assign({}, ...BLOCKS.map((b) => b.strings));
export const ACT4_QUEST_ITEMS = BLOCKS.flatMap((b) => b.items);
export const ACT4_QUEST_ITEM_STRINGS: Record<string, string> = Object.assign({}, ...BLOCKS.map((b) => b.itemStrings));

export const ACT4_QUEST_NOTES: QuestNoteSpec[] = ACT4_NOTE_LIST.map((x) => ({
  interactableId: `use:${x.id}`, anchorId: x.anchorId, ...(x.codexId ? { codexId: x.codexId } : {}),
}));
export const ACT4_NOTE_LOOKS: Record<string, 'page' | 'grave' | 'box'> = Object.fromEntries(ACT4_NOTE_LIST.map((x) => [`use:${x.id}`, x.look ?? 'page']));
export const ACT4_NOTE_CODEX: string[] = [...new Set(ACT4_NOTE_LIST.flatMap((n) => (n.codexId ? [n.codexId] : [])))];
