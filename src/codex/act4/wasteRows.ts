// L5's Waste creature codex rows (agreed shape, plans/act4-L9.md section 7). L5 exports `WASTE_CODEX_ROWS` from
// src/enemies/waste/codex.ts; until that module is on this branch the list is empty and the creatures have no entries.
// When L5's branch is stacked, this file re-exports from it (one line).
export interface WasteCodexRow {
  /** The enemy kind id, also the bestiary unlock id. */
  kind: string;
  /** Keys `codex.bestiary.<slug>.name` and `.body`. */
  slug: string;
  /** Those two keys, in English. */
  strings: Record<string, string>;
}

export const WASTE_CODEX_ROWS: readonly WasteCodexRow[] = [];
