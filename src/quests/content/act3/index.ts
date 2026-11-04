// Act 3 quest aggregates. Each Act 3 block adds its content here; the shared registries spread these lists next to Act 2's.
import type { QuestDef } from '../../types';
import type { QuestNoteSpec } from '../../notes';
import type { Act2Note } from '../act2/notes';
import type { CarryItemSpec } from '../carry';
import './greyfen/items';
import { GREYFEN } from './greyfen/greyfen.content';

export { GREYFEN, GREYFEN_QUEST_IDS } from './greyfen/greyfen.content';
export { GREYFEN_Q_NPC_DEFS, GREYFEN_Q_NPCS, GREYFEN_Q_NPC_STRINGS } from './greyfen/npcs';

const BLOCKS = [GREYFEN] as const;

export const ACT3_QUEST_DEFS: QuestDef[] = BLOCKS.flatMap((b) => b.quests);
export const ACT3_PROPS = BLOCKS.flatMap((b) => b.props);
export const ACT3_CARRY: CarryItemSpec[] = BLOCKS.flatMap((b) => b.carry);
export const ACT3_OBJECTIVE_FLAGS = BLOCKS.flatMap((b) => b.flags);
export const ACT3_NOTE_LIST: Act2Note[] = BLOCKS.flatMap((b) => b.notes);
export const ACT3_SPAWNERS = BLOCKS.flatMap((b) => b.spawners);
export const ACT3_TRIGGERS = BLOCKS.flatMap((b) => b.triggers);
export const ACT3_QUEST_STRINGS: Record<string, string> = Object.assign({}, ...BLOCKS.map((b) => b.strings));
export const ACT3_QUEST_ITEMS = BLOCKS.flatMap((b) => b.items);
export const ACT3_QUEST_ITEM_STRINGS: Record<string, string> = Object.assign({}, ...BLOCKS.map((b) => b.itemStrings));

export const ACT3_QUEST_NOTES: QuestNoteSpec[] = ACT3_NOTE_LIST.map((x) => ({
  interactableId: `use:${x.id}`, anchorId: x.anchorId, ...(x.codexId ? { codexId: x.codexId } : {}),
}));
export const ACT3_NOTE_LOOKS: Record<string, 'page' | 'grave' | 'box'> = Object.fromEntries(ACT3_NOTE_LIST.map((x) => [`use:${x.id}`, x.look ?? 'page']));
export const ACT3_NOTE_CODEX: string[] = [...new Set(ACT3_NOTE_LIST.flatMap((n) => (n.codexId ? [n.codexId] : [])))];
