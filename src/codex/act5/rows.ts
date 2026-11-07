// N5's Caldera creature rows, in the Act 4 shape. N5 exports `CALDERA_CODEX_ROWS` from src/enemies/act5/codex.ts (agreed in its
// thread: { kind, slug, strings, skin? }; skin rows share a base kind). Until N5's branch is merged the list is empty; the merge
// replaces this file's body with `export { CALDERA_CODEX_ROWS, type CalderaCodexRow } from '../../enemies/act5/codex';`.
export interface CalderaCodexRow {
  kind: string;
  slug: string;
  strings: Record<string, string>;
  /** Set on rows that share a base kind (grisel-loyalist, stoker-wraith, forge-thrall): they unlock by area, not by kind. */
  skin?: string;
}

export const CALDERA_CODEX_ROWS: readonly CalderaCodexRow[] = [];
