// N10: the Rim's Act 5 quest dialogue (plans/act5-N10.md): the trees of the seven quests' talkers and the readable notes, with
// their strings. Shipped trees are extended in front (`withRimA5`, node ids `a5r-`).
import type { DialogueDef } from '../../../../quests/types';
import { RIM_A5_NOTE_LIST } from '../../../../quests/content/act5/rim/notes';
import { extendTree, type BuiltTree } from '../../act2/build';
import { ALRIC_TREE } from './alric.dialogue';
import { ALLY_EXTENSIONS } from './allies.dialogue';
import { RIM_CAST_TREES, YSMERYTH_A5R } from './rim.dialogue';

/** New trees (the Rim's cast and its prop talks). */
export const RIM_A5_TREES: readonly BuiltTree[] = [ALRIC_TREE, ...RIM_CAST_TREES];
/** Extensions of shipped trees (their rules go first; node ids start `a5r-`). */
export const RIM_A5_EXTENSIONS: readonly BuiltTree[] = [...ALLY_EXTENSIONS, YSMERYTH_A5R];

/** One short dialogue per note (node ids '1'..'n', as Act 3's notes). */
export const RIM_A5_NOTE_DIALOGUES: DialogueDef[] = RIM_A5_NOTE_LIST.map((n) => ({
  id: n.id,
  start: '1',
  nodes: n.lines.map((_, i) => ({
    id: String(i + 1), speaker: n.speaker, textKey: `dialogue.${n.id}.${i + 1}`, next: i + 1 < n.lines.length ? String(i + 2) : null,
  })),
}));

/** Swaps the shipped trees for their extended versions and appends the new trees and notes. Throws if a base is missing. */
export function withRimA5(defs: DialogueDef[]): DialogueDef[] {
  const ext = new Map(RIM_A5_EXTENSIONS.map((e) => [e.def.id, e]));
  for (const id of ext.keys()) if (!defs.some((d) => d.id === id)) throw new Error(`withRimA5: no shipped tree ${id}`);
  const out = defs.map((d) => (ext.has(d.id) ? extendTree(d, ext.get(d.id)!).def : d));
  return [...out, ...RIM_A5_TREES.map((t) => t.def), ...RIM_A5_NOTE_DIALOGUES];
}

export const RIM_A5_DIALOGUE_STRINGS: Record<string, string> = Object.assign(
  {},
  ...RIM_A5_NOTE_LIST.map((n) => Object.fromEntries(n.lines.map((t, i) => [`dialogue.${n.id}.${i + 1}`, t]))),
  ...RIM_A5_TREES.map((t) => t.strings),
  ...RIM_A5_EXTENSIONS.map((t) => t.strings),
);
