// Shared helpers of the Rim dialogue trees (N10), in the shape of L11's waste/common.ts: a talk objective's start rule is derived
// from the quest definition, so the wiring cannot drift from the quest's order. Node ids of extensions to shipped trees all start
// `a5r-` (extendTree refuses a clash).
import type { Condition, QuestDef } from '../../../../quests/types';
import { RIM_A5_QUEST_DEFS } from '../../../../quests/content/act5/rim/rim.content';
import { withRimWithdrawal } from '../../../../quests/content/act5/foundry/phase';
import { buildTree, type BuiltTree, type Line } from '../../act2/build';
import { all, any, flagIs, not, objDone, objOpen, qActive, qDone, qIdle, step } from '../../act2/cond';

// N11 (additive): the defs as the Act 5 index registers them, so R29 is not offered after the descent (story.m54.started)
const DEFS: Record<string, QuestDef> = Object.fromEntries(withRimWithdrawal([...RIM_A5_QUEST_DEFS]).map((q) => [q.id, q]));
const def = (q: string, o: string) => {
  const d = DEFS[q]?.objectives.find((x) => x.id === o);
  if (!d) throw new Error(`rim a5 dialogue: ${q} has no objective ${o}`);
  return d;
};

/** `o` is the current step of quest `q`: for a sequential quest, the step before is done; otherwise its own `when` holds. */
export const at = (q: string, o: string): Condition => {
  const quest = DEFS[q]!;
  def(q, o);
  if (quest.sequential) {
    const objs = quest.objectives;
    const i = objs.findIndex((x) => x.id === o);
    return step(q, i === 0 ? null : objs[i - 1]!.id, o);
  }
  const w = def(q, o).when as Condition | undefined;
  return all(qActive(q), ...(w ? [w] : []), objOpen(q, o));
};

/** The quest can be offered: its own start condition holds and it has not begun. */
export const offer = (q: string): Condition => all(DEFS[q]!.startWhen as Condition, qIdle(q));

export { all, any, flagIs, not, objDone, qActive, qDone };

export const C = (t: string): Line => ({ s: 'cael', t });
/** A speaker's line builder. */
export const voice = (s: string) => (t: string, fx?: Line['fx']): Line => (fx ? { s, t, fx } : { s, t });
/** A line spoken only when `when` holds (it is skipped otherwise; the shorter branch never counts it). */
export const when = (line: Line, cond: Condition): Line => ({ ...line, when: cond });

type Rule = Parameters<typeof buildTree>[0]['start'][number];
/** A tree with an idle segment last (the catch-all rule). */
export const tree = (id: string, start: Rule[], segments: Record<string, { lines: Line[] }>, idle: Line[]): BuiltTree =>
  buildTree({ id, start: [...start, { when: all(), seg: 'idle' }], segments: { ...segments, idle: { lines: idle } } });

/** A brief line: accept starts the quest (the talk then counts its first step), "not yet" leaves it offered. */
export const accept = (speaker: string, q: string, ask: string, yes: string, no = 'Not yet.'): Line => ({
  s: speaker, t: ask,
  choices: [
    { id: 'accept', t: yes, go: null, fx: [{ startQuest: q }] },
    { id: 'later', t: no, go: null },
  ],
});
