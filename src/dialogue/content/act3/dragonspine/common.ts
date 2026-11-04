// Shared helpers of the lower Dragonspine dialogue trees (K13). A talk objective's start rule is derived from the quest
// definition (the objective before it), so the wiring cannot drift from the quest's order; the prose lives in the per-NPC files.
import type { Condition, QuestDef } from '../../../../quests/types';
import { m28 } from '../../../../quests/content/act3/dragonspine/m28.quest';
import { r15 } from '../../../../quests/content/act3/dragonspine/r15.quest';
import { m29 } from '../../../../quests/content/act3/dragonspine/m29.quest';
import { r16 } from '../../../../quests/content/act3/dragonspine/r16.quest';
import { m30 } from '../../../../quests/content/act3/dragonspine/m30.quest';
import { r17 } from '../../../../quests/content/act3/dragonspine/r17.quest';
import { r18 } from '../../../../quests/content/act3/dragonspine/r18.quest';
import type { Line } from '../../act2/build';
import { all, qActive, qIdle, step } from '../../act2/cond';

const DEFS: Record<string, QuestDef> = { m28, r15, m29, r16, m30, r17, r18 };

/** The objective that precedes `o` in quest `q` (null for the first). */
export const prevOf = (q: string, o: string): string | null => {
  const objs = DEFS[q]!.objectives;
  const i = objs.findIndex((x) => x.id === o);
  if (i < 0) throw new Error(`dragonspine dialogue: ${q} has no objective ${o}`);
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
