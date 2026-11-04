// Shared helpers of the Greyfen dialogue trees (K12). A talk objective's start rule is derived from the quest definition (the
// objective before it), so the wiring cannot drift from the quest's order; the prose lives in the per-NPC files.
import type { Condition, QuestDef } from '../../../../quests/types';
import { m23 } from '../../../../quests/content/act3/greyfen/m23.quest';
import { m24 } from '../../../../quests/content/act3/greyfen/m24.quest';
import { r12 } from '../../../../quests/content/act3/greyfen/r12.quest';
import { m25 } from '../../../../quests/content/act3/greyfen/m25.quest';
import { r14 } from '../../../../quests/content/act3/greyfen/r14.quest';
import { r13 } from '../../../../quests/content/act3/greyfen/r13.quest';
import { m26 } from '../../../../quests/content/act3/greyfen/m26.quest';
import { m27 } from '../../../../quests/content/act3/greyfen/m27.quest';
import { d05 } from '../../../../quests/content/act3/greyfen/d05.quest';
import type { Line } from '../../act2/build';
import { all, qActive, qIdle, step } from '../../act2/cond';

const DEFS: Record<string, QuestDef> = { m23, m24, r12, m25, r14, r13, m26, m27, d05 };

/** The objective that precedes `o` in quest `q` (null for the first). */
export const prevOf = (q: string, o: string): string | null => {
  const objs = DEFS[q]!.objectives;
  const i = objs.findIndex((x) => x.id === o);
  if (i < 0) throw new Error(`greyfen dialogue: ${q} has no objective ${o}`);
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
