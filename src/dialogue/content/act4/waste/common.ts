// Shared helpers of the Waste Act 4 dialogue trees (L11), in the shape of L10's harrowmark/common.ts: a talk objective's start
// rule is derived from the quest definition, so the wiring cannot drift from the quest's order. Node ids of extensions to
// shipped trees all start `a4w-` (extendTree refuses a clash).
import type { Condition, QuestDef } from '../../../../quests/types';
import { WASTE_A4_QUEST_DEFS } from '../../../../quests/content/act4/waste/waste.content';
import type { Line } from '../../act2/build';
import { all, objDone, objOpen, qActive, qIdle, step } from '../../act2/cond';

const DEFS: Record<string, QuestDef> = Object.fromEntries(WASTE_A4_QUEST_DEFS.map((q) => [q.id, q]));

/** The objective that precedes `o` in sequential quest `q` (null for the first). */
export const prevOf = (q: string, o: string): string | null => {
  const objs = DEFS[q]!.objectives;
  const i = objs.findIndex((x) => x.id === o);
  if (i < 0) throw new Error(`waste a4 dialogue: ${q} has no objective ${o}`);
  return i === 0 ? null : objs[i - 1]!.id;
};

/** `o` is the current step of sequential quest `q`. */
export const at = (q: string, o: string): Condition => step(q, prevOf(q, o), o);

/** A step of the unordered M43 is open: the quest runs, the step's own `when` holds and it is not done. */
export const open43 = (o: string): Condition => {
  const def = DEFS.m43!.objectives.find((x) => x.id === o);
  if (!def) throw new Error(`waste a4 dialogue: m43 has no objective ${o}`);
  return all(qActive('m43'), ...(def.when ? [def.when as Condition] : []), objOpen('m43', o));
};

/** The quest can be offered: its own start condition holds and it has not begun. */
export const offer = (q: string): Condition => all(DEFS[q]!.startWhen as Condition, qIdle(q));

export { all, objDone, qActive };

export const C = (t: string): Line => ({ s: 'cael', t });
/** A speaker's line builder. */
export const voice = (s: string) => (t: string, fx?: Line['fx']): Line => (fx ? { s, t, fx } : { s, t });
