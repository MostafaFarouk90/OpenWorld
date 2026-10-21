import type { DialogueDef } from '../../../quests/types';
import { ACT2_NOTE_LIST } from '../../../quests/content/act2/notes';

/** The Act 2 readable notes (src/quests/content/act2/notes.ts): one short dialogue each, node ids '1'..'n'; the strings live with the quest strings. */
export const ACT2_NOTE_DIALOGUES: DialogueDef[] = ACT2_NOTE_LIST.map((n) => ({
  id: n.id,
  start: '1',
  nodes: n.lines.map((_, i) => ({
    id: String(i + 1), speaker: n.speaker, textKey: `dialogue.${n.id}.${i + 1}`, next: i + 1 < n.lines.length ? String(i + 2) : null,
  })),
}));
