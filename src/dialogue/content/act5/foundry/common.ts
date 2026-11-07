// Shared helpers of the Foundry Act 5 dialogue trees (N11), in the shape of L11's waste/common.ts: a talk objective's start
// rule is derived from the quest definition, so the wiring cannot drift from the quest's order. Node ids of extensions to
// shipped trees all start `a5f-` (extendTree refuses a clash).
import type { Condition, QuestDef } from '../../../../quests/types';
import { FOUNDRY_A5_QUEST_DEFS } from '../../../../quests/content/act5/foundry/foundry.content';
import type { Line } from '../../act2/build';
import { all, any, flagIs, not, objDone, objOpen, qActive, qDone, qIdle, step } from '../../act2/cond';

const DEFS: Record<string, QuestDef> = Object.fromEntries(FOUNDRY_A5_QUEST_DEFS.map((q) => [q.id, q]));
const def = (q: string): QuestDef => {
  const d = DEFS[q];
  if (!d) throw new Error(`foundry a5 dialogue: no quest ${q}`);
  return d;
};

/** The objective that precedes `o` in sequential quest `q` (null for the first). */
export const prevOf = (q: string, o: string): string | null => {
  const objs = def(q).objectives;
  const i = objs.findIndex((x) => x.id === o);
  if (i < 0) throw new Error(`foundry a5 dialogue: ${q} has no objective ${o}`);
  return i === 0 ? null : objs[i - 1]!.id;
};

/** `o` is the current step of sequential quest `q`. */
export const at = (q: string, o: string): Condition => step(q, prevOf(q, o), o);

/** A step of an unordered quest is open: the quest runs, the step's own `when` holds and it is not done. */
export const open = (q: string, o: string): Condition => {
  const d = def(q).objectives.find((x) => x.id === o);
  if (!d) throw new Error(`foundry a5 dialogue: ${q} has no objective ${o}`);
  return all(qActive(q), ...(d.when ? [d.when as Condition] : []), objOpen(q, o));
};

/** The quest can be offered: its own start condition holds and it has not begun. */
export const offer = (q: string): Condition => all(def(q).startWhen as Condition, qIdle(q));

export { all, any, flagIs, not, objDone, qActive, qDone };

export const C = (t: string): Line => ({ s: 'cael', t });
/** A speaker's line builder. */
export const voice = (s: string) => (t: string, fx?: Line['fx']): Line => (fx ? { s, t, fx } : { s, t });
export const when = (l: Line, c: Condition): Line => ({ ...l, when: c });
