// N11: the Foundry Act 5 quest dialogue (plans/act5-N11.md section 9): the trees of the Foundry quests' talkers and their
// readable notes, with their strings. Shipped trees are extended in front (`withFoundryA5`, node ids `a5f-`); Alric's tree is
// the Rim block's (N10), so a stand-in is added only when it is missing.
import type { DialogueDef } from '../../../../quests/types';
import { FOUNDRY_A5_NOTE_LIST } from '../../../../quests/content/act5/foundry/notes';
import { extendTree, type BuiltTree } from '../../act2/build';
import { EDRIC_A5F, R30_LINE_TREES, ROOK_A5F, TOBB_A5F, WENNA_A5F, WULFHILD_A5F } from './camp.dialogue';
import { ALRIC_A5F, ALRIC_BASE, ALRIC_BASE_STRINGS, CAPTAIN_TREE, MOURNER_TREES, STOKER_TREE, VEY_TRUCE_TREE } from './foundry.dialogue';

/** New trees (the Foundry quests' own cast). */
export const FOUNDRY_A5_TREES: readonly BuiltTree[] = [CAPTAIN_TREE, ...MOURNER_TREES, VEY_TRUCE_TREE, STOKER_TREE];
/** Extensions of shipped (or Rim) trees: their rules go first. */
export const FOUNDRY_A5_EXTENSIONS: readonly BuiltTree[] = [WENNA_A5F, WULFHILD_A5F, TOBB_A5F, EDRIC_A5F, ROOK_A5F, ALRIC_A5F, ...R30_LINE_TREES];

/** One short dialogue per note (node ids '1'..'n', as Act 3's and the Waste's notes). */
export const FOUNDRY_A5_NOTE_DIALOGUES: DialogueDef[] = FOUNDRY_A5_NOTE_LIST.map((n) => ({
  id: n.id,
  start: '1',
  nodes: n.lines.map((_, i) => ({
    id: String(i + 1), speaker: n.speaker, textKey: `dialogue.${n.id}.${i + 1}`, next: i + 1 < n.lines.length ? String(i + 2) : null,
  })),
}));

/** Swaps the extended trees in, adds Alric's stand-in when the Rim block has not, and appends the new trees and notes. */
export function withFoundryA5(defs: DialogueDef[]): DialogueDef[] {
  const base = defs.some((d) => d.id === ALRIC_BASE.id) ? defs : [...defs, ALRIC_BASE];
  const ext = new Map(FOUNDRY_A5_EXTENSIONS.map((e) => [e.def.id, e]));
  if (ext.size !== FOUNDRY_A5_EXTENSIONS.length) throw new Error('withFoundryA5: two extensions share a tree');
  for (const id of ext.keys()) if (!base.some((d) => d.id === id)) throw new Error(`withFoundryA5: no shipped tree ${id}`);
  const out = base.map((d) => (ext.has(d.id) ? extendTree(d, ext.get(d.id)!).def : d));
  return [...out, ...FOUNDRY_A5_TREES.map((t) => t.def), ...FOUNDRY_A5_NOTE_DIALOGUES];
}

export const FOUNDRY_A5_DIALOGUE_STRINGS: Record<string, string> = Object.assign(
  {},
  ALRIC_BASE_STRINGS,
  ...FOUNDRY_A5_NOTE_LIST.map((n) => Object.fromEntries(n.lines.map((t, i) => [`dialogue.${n.id}.${i + 1}`, t]))),
  ...FOUNDRY_A5_TREES.map((t) => t.strings),
  ...FOUNDRY_A5_EXTENSIONS.map((t) => t.strings),
);
