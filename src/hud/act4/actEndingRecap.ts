// Act 4 L9: the recap on "The Road to the Rim" card (plans/act4-L9.md section 6). Rows read flags other threads write; a
// missing flag drops its line, so the card works before L11 and L6 PR 2 land. "The story continues." is always last.
import { act3RecapLines, type RecapRow } from '../act3/actEndingRecap';
import type { Translate } from '../widget';

export const A4_CONTINUES_KEY = 'hud.ending.a4.continues';
export const BELLOWS_OUTCOME_FLAG = 'boss.bellows-engine.outcome';
export const EORMEN_OUTCOME_FLAG = 'boss.eormen.outcome';
export const R24_CHOICE_FLAG = 'story.r24.choice';

/** In play order. Exported and mutable on purpose, as Act 3's: L11 may push its own rows. */
export const ACT4_RECAP_ROWS: RecapRow[] = [
  { id: 'm38', line: (read) => (read('story.m38.complete') ? 'hud.ending.a4.line.m38' : null) },
  { id: 'm39', line: (read) => (read('story.m39.complete') ? 'hud.ending.a4.line.m39' : null) },
  { id: 'd07', line: (read) => (read(BELLOWS_OUTCOME_FLAG) === 'defeated' ? 'hud.ending.a4.line.d07' : null) },
  { id: 'm43', line: (read) => (read('story.m43.complete') ? 'hud.ending.a4.line.m43' : null) },
  {
    id: 'r24',
    line: (read) => (read(R24_CHOICE_FLAG) === 'all' ? 'hud.ending.a4.line.r24.all' : read(R24_CHOICE_FLAG) === 'half' ? 'hud.ending.a4.line.r24.half' : null),
  },
  {
    id: 'd08',
    line: (read) =>
      read(EORMEN_OUTCOME_FLAG) === 'released' ? 'hud.ending.a4.line.d08.released' : read(EORMEN_OUTCOME_FLAG) === 'defeated' ? 'hud.ending.a4.line.d08.defeated' : null,
  },
];

export function act4RecapLines(read: (flag: string) => unknown, t: Translate, rows: readonly RecapRow[] = ACT4_RECAP_ROWS): string[] {
  return act3RecapLines(read, t, rows, A4_CONTINUES_KEY);
}
