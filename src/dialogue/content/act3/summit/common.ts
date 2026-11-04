// Shared helpers of the summit dialogue trees (K13 PR 2), as the lower block's: a talk objective's start rule is derived from the
// quest definition (the objective before it), so the wiring cannot drift from the quest's order; the prose lives in the per-NPC files.
import type { Condition, QuestDef } from '../../../../quests/types';
import { m31 } from '../../../../quests/content/act3/summit/m31.quest';
import { m32 } from '../../../../quests/content/act3/summit/m32.quest';
import { m33 } from '../../../../quests/content/act3/summit/m33.quest';
import { m34 } from '../../../../quests/content/act3/summit/m34.quest';
import { d06 } from '../../../../quests/content/act3/summit/d06.quest';
import type { Line } from '../../act2/build';
import { all, any, flagIs, qActive, qIdle, step } from '../../act2/cond';

const DEFS: Record<string, QuestDef> = { m31, m32, m33, m34, d06 };

/** The objective that precedes `o` in quest `q` (null for the first). */
export const prevOf = (q: string, o: string): string | null => {
  const objs = DEFS[q]!.objectives;
  const i = objs.findIndex((x) => x.id === o);
  if (i < 0) throw new Error(`summit dialogue: ${q} has no objective ${o}`);
  return i === 0 ? null : objs[i - 1]!.id;
};

/** `o` is the current step of `q`. */
export const at = (q: string, o: string): Condition => step(q, prevOf(q, o), o);

/** The quest can be offered: its own start condition holds and it has not begun. */
export const offer = (q: string): Condition => all(DEFS[q]!.startWhen as Condition, qIdle(q));

/** The witnesses flag holds `n` (the conditions only compare for equality). */
export const witnessesAre = (flag: string, from: number, to: number): Condition =>
  any(...Array.from({ length: to - from + 1 }, (_, i) => flagIs(flag, from + i)));

export { qActive };

export const C = (t: string): Line => ({ s: 'cael', t });
/** A speaker's line builder. */
export const voice = (s: string) => (t: string, fx?: Line['fx']): Line => (fx ? { s, t, fx } : { s, t });
