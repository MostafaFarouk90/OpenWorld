import type { DialogueDef } from '../../quests/types';

/**
 * Readable notes (src/quests/notes.ts): a page, a stone or a ledger read with F. Each is a dialogue whose id is the
 * note id (the talk target); speaker 'note' is a written page, 'cael' is Cael's own reading of something.
 */
function note(id: string, lines: number, speaker: 'note' | 'cael' = 'note'): DialogueDef {
  const nodes = Array.from({ length: lines }, (_, i) => ({
    id: String(i + 1), speaker, textKey: `dialogue.${id}.${i + 1}`, next: i + 1 < lines ? String(i + 2) : null,
  }));
  return { id, start: '1', nodes };
}

export const NOTE_DIALOGUES: DialogueDef[] = [
  note('note-m02-badge', 3),
  note('note-m02-order', 2),
  note('note-m03-font', 2, 'cael'),
  note('note-m03-ember', 2, 'cael'),
  note('note-m03-wulfric', 3),
  note('note-m03-record', 2),
  note('note-m04-toll-box', 3),
  note('note-r01-shawl', 2, 'cael'),
  note('note-m05-journal', 4),
  note('note-deadroad-stone-1', 2),
  note('note-deadroad-stone-2', 2),
  note('note-deadroad-reed', 2),
  note('note-deadroad-barrow', 2),
  note('note-d01-tablet-1', 2),
  note('note-d01-tablet-2', 2),
  note('note-d01-tablet-3', 3),
  note('note-d01-tablet-4', 2),
  note('note-d01-censer', 3, 'cael'),
];
