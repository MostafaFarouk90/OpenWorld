import { ACT_ENDING_MAX_LINES } from '../ActEndingCard';
import type { Translate } from '../widget';

export const M31_CHOICE_FLAG = 'story.m31.choice';
export const D06_OUTCOME_FLAG = 'boss.corvin-skarl.outcome';
/** The recap's last line, always (plan Q8). */
export const A3_CONTINUES_KEY = 'hud.ending.a3.continues';

/** One recap line: `line` returns its string key, or null to drop it (a missing flag drops its line). */
export interface RecapRow {
  id: string;
  line(read: (flag: string) => unknown): string | null;
}

/**
 * The Act 3 ending card's recap rows, in order. Exported and mutable on purpose: K13 and K16 may push their own rows
 * (the "The story continues." line is not a row, it is appended after them, so it is always last).
 */
export const ACT3_RECAP_ROWS: RecapRow[] = [
  { id: 'm31', line: (read) => (read(M31_CHOICE_FLAG) === 'won' ? 'hud.ending.a3.line.m31.won' : read(M31_CHOICE_FLAG) === 'yielded' ? 'hud.ending.a3.line.m31.yielded' : null) },
  { id: 'd06', line: (read) => (read(D06_OUTCOME_FLAG) === 'defeated' ? 'hud.ending.a3.line.d06.defeated' : read(D06_OUTCOME_FLAG) === 'spared' ? 'hud.ending.a3.line.d06.spared' : null) },
  { id: 'oath', line: () => 'hud.ending.a3.line.oath' },
];

/** The recap text: every row that has a line (a throwing row is skipped), then "The story continues." */
export function act3RecapLines(read: (flag: string) => unknown, t: Translate, rows: readonly RecapRow[] = ACT3_RECAP_ROWS): string[] {
  const out: string[] = [];
  for (const r of rows) {
    // The card draws at most ACT_ENDING_MAX_LINES; the closing line must never be the one cut.
    if (out.length >= ACT_ENDING_MAX_LINES - 1) break;
    try {
      const key = r.line(read);
      if (key) out.push(t(key));
    } catch (err) {
      console.warn(`act3 ending recap: row "${r.id}" failed`, err);
    }
  }
  out.push(t(A3_CONTINUES_KEY));
  return out;
}
