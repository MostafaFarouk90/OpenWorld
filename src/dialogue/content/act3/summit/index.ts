// K13 PR 2: the summit quest dialogue (plans/act3-K13-pr2.md section 3): the trees of the five quests' talkers, the set-piece scenes and the readable notes,
// with their strings. Eadgyth's and Thorgar's lower-slope trees are extended in front (`withSummit`); the two shared indexes take one line each.
import type { DialogueDef } from '../../../../quests/types';
import { SUMMIT_NOTE_LIST } from '../../../../quests/content/act3/summit/notes';
import { extendTree, type BuiltTree } from '../../act2/build';
import { EADGYTH_SUMMIT } from './eadgyth.dialogue';
import { THORGAR_SUMMIT } from './thorgar.dialogue';
import { YSMERYTH } from './ysmeryth.dialogue';
import { SUMMIT_MINOR_TREES } from './minor.dialogue';
import { SUMMIT_SCENE_TREES, SUMMIT_SPEAKER_NAMES } from './scenes.dialogue';

/** New trees (the summit's own talkers and scenes). */
export const SUMMIT_TREES: readonly BuiltTree[] = [YSMERYTH, ...SUMMIT_MINOR_TREES, ...SUMMIT_SCENE_TREES];
/** Extensions of the lower-slope trees. */
export const SUMMIT_EXTENSIONS: readonly BuiltTree[] = [EADGYTH_SUMMIT, THORGAR_SUMMIT];

/** One short dialogue per note (node ids '1'..'n', as the lower block's notes). */
export const SUMMIT_NOTE_DIALOGUES: DialogueDef[] = SUMMIT_NOTE_LIST.map((n) => ({
  id: n.id,
  start: '1',
  nodes: n.lines.map((_, i) => ({
    id: String(i + 1), speaker: n.speaker, textKey: `dialogue.${n.id}.${i + 1}`, next: i + 1 < n.lines.length ? String(i + 2) : null,
  })),
}));

/** Swaps Eadgyth's and Thorgar's trees for their summit-extended versions and appends the new trees and notes. */
export function withSummit(defs: DialogueDef[]): DialogueDef[] {
  const ext = new Map(SUMMIT_EXTENSIONS.map((e) => [e.def.id, e]));
  const out = defs.map((d) => (ext.has(d.id) ? extendTree(d, ext.get(d.id)!).def : d));
  return [...out, ...SUMMIT_TREES.map((t) => t.def), ...SUMMIT_NOTE_DIALOGUES];
}

export const SUMMIT_DIALOGUE_STRINGS: Record<string, string> = Object.assign(
  {},
  ...SUMMIT_NOTE_LIST.map((n) => Object.fromEntries(n.lines.map((t, i) => [`dialogue.${n.id}.${i + 1}`, t]))),
  ...SUMMIT_TREES.map((t) => t.strings),
  ...SUMMIT_EXTENSIONS.map((t) => t.strings),
  SUMMIT_SPEAKER_NAMES,
);
