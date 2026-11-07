// L11: the Waste Act 4 quest dialogue (plans/act4-L11.md): the trees of the eight quests' talkers and the readable notes, with
// their strings. Hrolf's shipped tree is extended in front (`withWasteA4`); the two shared indexes take one line each.
import type { DialogueDef } from '../../../../quests/types';
import { WASTE_A4_NOTE_LIST } from '../../../../quests/content/act4/waste/notes';
import { extendTree, type BuiltTree } from '../../act2/build';
import { WULFHILD } from './wulfhild.dialogue';
import { CAMP_TREES } from './camp.dialogue';
import { CHAPEL_TREES } from './chapel.dialogue';
import { HROLF_A4W, KEEPER_TREES } from './road.dialogue';

/** New trees (the Waste cast). */
export const WASTE_A4_TREES: readonly BuiltTree[] = [WULFHILD, ...CAMP_TREES, ...CHAPEL_TREES, ...KEEPER_TREES];
/** Extensions of shipped trees (their rules go first; node ids start `a4w-`). */
export const WASTE_A4_EXTENSIONS: readonly BuiltTree[] = [HROLF_A4W];

/** One short dialogue per note (node ids '1'..'n', as Act 3's notes). */
export const WASTE_A4_NOTE_DIALOGUES: DialogueDef[] = WASTE_A4_NOTE_LIST.map((n) => ({
  id: n.id,
  start: '1',
  nodes: n.lines.map((_, i) => ({
    id: String(i + 1), speaker: n.speaker, textKey: `dialogue.${n.id}.${i + 1}`, next: i + 1 < n.lines.length ? String(i + 2) : null,
  })),
}));

/** Swaps the shipped trees for their extended versions and appends the new trees and notes. Throws if a base is missing. */
export function withWasteA4(defs: DialogueDef[]): DialogueDef[] {
  const ext = new Map(WASTE_A4_EXTENSIONS.map((e) => [e.def.id, e]));
  for (const id of ext.keys()) if (!defs.some((d) => d.id === id)) throw new Error(`withWasteA4: no shipped tree ${id}`);
  const out = defs.map((d) => (ext.has(d.id) ? extendTree(d, ext.get(d.id)!).def : d));
  return [...out, ...WASTE_A4_TREES.map((t) => t.def), ...WASTE_A4_NOTE_DIALOGUES];
}

export const WASTE_A4_DIALOGUE_STRINGS: Record<string, string> = Object.assign(
  {},
  ...WASTE_A4_NOTE_LIST.map((n) => Object.fromEntries(n.lines.map((t, i) => [`dialogue.${n.id}.${i + 1}`, t]))),
  ...WASTE_A4_TREES.map((t) => t.strings),
  ...WASTE_A4_EXTENSIONS.map((t) => t.strings),
);
