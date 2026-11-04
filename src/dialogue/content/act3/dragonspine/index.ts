// K13: the lower Dragonspine quest dialogue (plans/act3-K13.md section 3): the trees of the seven quests' talkers, the set-piece
// scenes and the readable notes, with their strings. The two shared indexes take one import line each.
import type { DialogueDef } from '../../../../quests/types';
import { DRAGONSPINE_NOTE_LIST } from '../../../../quests/content/act3/dragonspine/notes';
import type { BuiltTree } from '../../act2/build';
import { THORGAR } from './thorgar.dialogue';
import { EADGYTH } from './eadgyth.dialogue';
import { ANSGAR } from './ansgar.dialogue';
import { MINOR_TREES } from './minor.dialogue';
import { SCENE_TREES, SPEAKER_NAMES } from './scenes.dialogue';

export const DRAGONSPINE_TREES: readonly BuiltTree[] = [THORGAR, EADGYTH, ANSGAR, ...MINOR_TREES, ...SCENE_TREES];

/** One short dialogue per note (node ids '1'..'n', as Act 2's notes). */
export const DRAGONSPINE_NOTE_DIALOGUES: DialogueDef[] = DRAGONSPINE_NOTE_LIST.map((n) => ({
  id: n.id,
  start: '1',
  nodes: n.lines.map((_, i) => ({
    id: String(i + 1), speaker: n.speaker, textKey: `dialogue.${n.id}.${i + 1}`, next: i + 1 < n.lines.length ? String(i + 2) : null,
  })),
}));

export const DRAGONSPINE_DIALOGUES: DialogueDef[] = [...DRAGONSPINE_TREES.map((t) => t.def), ...DRAGONSPINE_NOTE_DIALOGUES];

export const DRAGONSPINE_DIALOGUE_STRINGS: Record<string, string> = Object.assign(
  {},
  ...DRAGONSPINE_NOTE_LIST.map((n) => Object.fromEntries(n.lines.map((t, i) => [`dialogue.${n.id}.${i + 1}`, t]))),
  ...DRAGONSPINE_TREES.map((t) => t.strings),
  SPEAKER_NAMES,
);
