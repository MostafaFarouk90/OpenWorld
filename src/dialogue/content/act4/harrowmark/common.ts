// Shared helpers of the Harrowmark Act 4 dialogue trees (L10). A talk objective's start rule is derived from the quest
// definition (the objective before it), so the wiring cannot drift from the quest's order; the prose lives in the per-speaker
// files. Node ids of extensions to shipped trees all start `a4-` (extendTree refuses a clash).
import type { Condition, QuestDef } from '../../../../quests/types';
import { HARROWMARK_A4_QUEST_DEFS } from '../../../../quests/content/act4/harrowmark/harrowmark.content';
import type { Line } from '../../act2/build';
import { all, qActive, qIdle, step } from '../../act2/cond';

const DEFS: Record<string, QuestDef> = Object.fromEntries(HARROWMARK_A4_QUEST_DEFS.map((q) => [q.id, q]));

/** The objective that precedes `o` in quest `q` (null for the first). */
export const prevOf = (q: string, o: string): string | null => {
  const objs = DEFS[q]!.objectives;
  const i = objs.findIndex((x) => x.id === o);
  if (i < 0) throw new Error(`harrowmark a4 dialogue: ${q} has no objective ${o}`);
  return i === 0 ? null : objs[i - 1]!.id;
};

/** `o` is the current step of `q`. */
export const at = (q: string, o: string): Condition => step(q, prevOf(q, o), o);

/** The quest can be offered: its own start condition holds and it has not begun. */
export const offer = (q: string): Condition => all(DEFS[q]!.startWhen as Condition, qIdle(q));

export { qActive };

export const C = (t: string): Line => ({ s: 'cael', t });
/** A speaker's line builder. */
export const voice = (s: string) => (t: string, fx?: Line['fx']): Line => (fx ? { s, t, fx } : { s, t });
/** A line shown only when `when` holds. */
export const when = (l: Line, c: Condition): Line => ({ ...l, when: c });
