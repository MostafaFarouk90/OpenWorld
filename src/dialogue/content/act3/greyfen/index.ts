// K12: the Greyfen quest dialogue (plans/act3-K12.md section 5): the trees of the nine quests' talkers, the set-piece scenes and
// the readable notes, with their strings. The two shared indexes take one import line each.
import type { DialogueDef } from '../../../../quests/types';
import { GREYFEN_NOTE_LIST } from '../../../../quests/content/act3/greyfen/notes';
import type { BuiltTree } from '../../act2/build';
import { LEOFA } from './leofa.dialogue';
import { DUDDA, HILD, WIDOW, CUTTER1, CUTTER2, HAND_TREES } from './ferry.dialogue';
import { GYTHA } from './gytha.dialogue';
import { MINOR_TREES } from './minor.dialogue';
import { SCENE_TREES, SPEAKER_NAMES } from './scenes.dialogue';

export const GREYFEN_TREES: readonly BuiltTree[] = [LEOFA, DUDDA, HILD, WIDOW, CUTTER1, CUTTER2, ...HAND_TREES, GYTHA, ...MINOR_TREES, ...SCENE_TREES];

/** One one-line dialogue per Greyfen note (node ids '1'..'n', as Act 2's notes). */
export const GREYFEN_NOTE_DIALOGUES: DialogueDef[] = GREYFEN_NOTE_LIST.map((n) => ({
  id: n.id,
  start: '1',
  nodes: n.lines.map((_, i) => ({
    id: String(i + 1), speaker: n.speaker, textKey: `dialogue.${n.id}.${i + 1}`, next: i + 1 < n.lines.length ? String(i + 2) : null,
  })),
}));

export const GREYFEN_DIALOGUES: DialogueDef[] = [...GREYFEN_TREES.map((t) => t.def), ...GREYFEN_NOTE_DIALOGUES];

export const GREYFEN_DIALOGUE_STRINGS: Record<string, string> = Object.assign(
  {},
  ...GREYFEN_NOTE_LIST.map((n) => Object.fromEntries(n.lines.map((t, i) => [`dialogue.${n.id}.${i + 1}`, t]))),
  ...GREYFEN_TREES.map((t) => t.strings),
  SPEAKER_NAMES,
);
