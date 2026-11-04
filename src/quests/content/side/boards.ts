// Reusable pieces for jobs that start from something the player reads in the world: a stone, a tablet, or (j05 to j07, in a
// later round) a notice on Rook's bounty board. Each builds on the readable-note card (src/quests/notes.ts): F reads a short
// dialogue under the note's own id; the last line writes a flag and starts the job if it is not yet running. The job's
// first objective can then be a `talk` with the note id, which the same read credits once the quest has begun.
import type { Condition, DialogueDef, DialogueNode, Effect } from '../../types';
import type { QuestNoteSpec } from '../../notes';

export type NoteSpeaker = 'note' | 'cael';

export interface StartingNote {
  /** note id; the interactable is `use:<id>`, the dialogue id and the talk target are `<id>` */
  id: string;
  anchorId: string;
  quest: string;
  /** flag written by the last line (what the quest's `startWhen` and its dialogue gates read) */
  flag: string;
  /** one speaker per line; the line keys are `dialogue.<id>.<n>` (1-based) */
  speakers: NoteSpeaker[];
  /** readable only while this holds (a board's offer condition); default always */
  when?: Condition;
  codexId?: string;
  promptKey?: string;
  look?: 'page' | 'grave' | 'box';
  /** extra effects on the last line (the barrow tablet wakes its wraiths through the quest-level flag instead) */
  effects?: Effect[];
}

export interface StartingNoteParts {
  note: QuestNoteSpec;
  dialogue: DialogueDef;
  look: { id: string; look: 'page' | 'grave' | 'box' };
}

/** The last line of a starting note: set the flag, then start the quest if nothing has started it yet. */
export const startEffects = (quest: string, flag: string, extra: Effect[] = []): Effect[] => [
  { setFlag: flag, value: true },
  { if: { quest, state: 'inactive' }, then: [{ startQuest: quest }] },
  ...extra,
];

export function startingNote(s: StartingNote): StartingNoteParts {
  const nodes: DialogueNode[] = s.speakers.map((speaker, i) => {
    const last = i === s.speakers.length - 1;
    return {
      id: String(i + 1), speaker, textKey: `dialogue.${s.id}.${i + 1}`, next: last ? null : String(i + 2),
      ...(last ? { effects: startEffects(s.quest, s.flag, s.effects) } : {}),
    };
  });
  const interactableId = `use:${s.id}`;
  return {
    note: {
      interactableId, anchorId: s.anchorId,
      ...(s.when ? { when: s.when } : {}), ...(s.codexId ? { codexId: s.codexId } : {}), ...(s.promptKey ? { promptKey: s.promptKey } : {}),
    },
    dialogue: { id: s.id, start: '1', nodes },
    look: { id: interactableId, look: s.look ?? 'page' },
  };
}

/**
 * A notice on a bounty board: a starting note that reads only while the job is on offer (`offerWhen`) or already running.
 * Rook's board (j05 to j07) uses this with its three notices.
 */
export function boardNotice(s: Omit<StartingNote, 'when' | 'speakers'> & { offerWhen: Condition; lines: number }): StartingNoteParts {
  return startingNote({
    ...s,
    speakers: Array.from({ length: s.lines }, () => 'note' as const),
    when: { any: [s.offerWhen, { quest: s.quest, state: 'active' }] },
    look: s.look ?? 'page',
  });
}
