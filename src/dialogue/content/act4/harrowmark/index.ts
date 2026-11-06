// L10: the Harrowmark Act 4 quest dialogue (plans/act4-L10.md section 2): the trees of the nine quests' talkers, the set-piece
// scenes and the readable notes, with their strings. Shipped trees are extended in front (`withHarrowmarkA4`); the two shared
// indexes take one line each.
import type { DialogueDef } from '../../../../quests/types';
import { HARROWMARK_A4_NOTE_LIST } from '../../../../quests/content/act4/harrowmark/notes';
import { extendTree, type BuiltTree } from '../../act2/build';
import { WYSTAN_A4 } from './wystan.dialogue';
import { MERRIN_A4 } from './merrin.dialogue';
import { ROOK_A4 } from './rook.dialogue';
import { DUNSTAN_A4 } from './dunstan.dialogue';
import { GAUT_A4, ORRIN_A4, TOBB_A4, WENNA_A4 } from './friends.dialogue';
import { CAST_TREES } from './cast.dialogue';
import { SCENE_TREES, SPEAKER_NAMES } from './scenes.dialogue';

/** New trees (the new cast and the scenes). */
export const HARROWMARK_A4_TREES: readonly BuiltTree[] = [...CAST_TREES, ...SCENE_TREES];
/** Extensions of shipped trees (their rules go first; node ids start `a4-`). */
export const HARROWMARK_A4_EXTENSIONS: readonly BuiltTree[] = [WYSTAN_A4, MERRIN_A4, ROOK_A4, DUNSTAN_A4, WENNA_A4, ORRIN_A4, TOBB_A4, GAUT_A4];

/** One short dialogue per note (node ids '1'..'n', as Act 3's notes). */
export const HARROWMARK_A4_NOTE_DIALOGUES: DialogueDef[] = HARROWMARK_A4_NOTE_LIST.map((n) => ({
  id: n.id,
  start: '1',
  nodes: n.lines.map((_, i) => ({
    id: String(i + 1), speaker: n.speaker, textKey: `dialogue.${n.id}.${i + 1}`, next: i + 1 < n.lines.length ? String(i + 2) : null,
  })),
}));

/** Swaps the shipped trees for their Act 4 extended versions and appends the new trees and notes. Throws if a base is missing. */
export function withHarrowmarkA4(defs: DialogueDef[]): DialogueDef[] {
  const ext = new Map(HARROWMARK_A4_EXTENSIONS.map((e) => [e.def.id, e]));
  for (const id of ext.keys()) if (!defs.some((d) => d.id === id)) throw new Error(`withHarrowmarkA4: no shipped tree ${id}`);
  const out = defs.map((d) => (ext.has(d.id) ? extendTree(d, ext.get(d.id)!).def : d));
  return [...out, ...HARROWMARK_A4_TREES.map((t) => t.def), ...HARROWMARK_A4_NOTE_DIALOGUES];
}

export const HARROWMARK_A4_DIALOGUE_STRINGS: Record<string, string> = Object.assign(
  {},
  ...HARROWMARK_A4_NOTE_LIST.map((n) => Object.fromEntries(n.lines.map((t, i) => [`dialogue.${n.id}.${i + 1}`, t]))),
  ...HARROWMARK_A4_TREES.map((t) => t.strings),
  ...HARROWMARK_A4_EXTENSIONS.map((t) => t.strings),
  SPEAKER_NAMES,
);
