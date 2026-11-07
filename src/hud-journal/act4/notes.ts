// Act 4 L9 (plans/act4-L9.md section 3): the journal's notes above the quests. Pure: each reads flags, quest states and quest
// defs through ports, so a load, an accept or a new quest def re-derives it on the next draw with nothing cached.
import type { Condition, QuestDef, QuestState } from '../../quests/types';

export interface NotePorts {
  flag(key: string): boolean;
  questState(id: string): QuestState;
  questDef(id: string): QuestDef | undefined;
  t(key: string, params?: Record<string, string | number>): string;
}

/** Where an act begins (Act 3 playthrough M4): shown after the act's gate until its first quest is accepted. */
export interface ActStartRow {
  act: number;
  gateFlag: string;
  firstQuest: string;
  textKey: string;
}

/** One row per act; Act 5 adds its own. */
export const ACT_START_ROWS: ActStartRow[] = [
  { act: 3, gateFlag: 'story.gate.a3', firstQuest: 'm23', textKey: 'hud.journal.start.a3' },
  { act: 4, gateFlag: 'story.gate.a4', firstQuest: 'm35', textKey: 'hud.journal.start.a4' },
];

const accepted = (s: QuestState): boolean => s === 'active' || s === 'completed' || s === 'failed';

/** The newest act whose gate is open and whose first quest is not yet accepted, or null. */
export function actStartNote(ports: NotePorts, rows: readonly ActStartRow[] = ACT_START_ROWS): { id: string; title: string } | null {
  for (const r of [...rows].sort((a, b) => b.act - a.act)) {
    if (!ports.flag(r.gateFlag)) continue;
    // A later act is open: an earlier act's pointer is stale whatever its quest says.
    if (accepted(ports.questState(r.firstQuest))) return null;
    return { id: `start.a${r.act}`, title: ports.t(r.textKey) };
  }
  return null;
}

/** The quests a `startWhen` needs completed: its top-level `{ quest, state: 'completed' }` clauses, alone or under `all`. */
export function requiredQuests(cond: Condition | undefined): string[] {
  if (!cond) return [];
  const out: string[] = [];
  const visit = (c: Condition): void => {
    if ('all' in c) for (const x of c.all) visit(x);
    else if ('quest' in c) {
      const states = Array.isArray(c.state) ? c.state : [c.state];
      if (states.length === 1 && states[0] === 'completed') out.push(c.quest);
    }
  };
  visit(cond);
  return [...new Set(out)];
}

/** Gated quests whose wait the journal spells out (plan 2.5, Q12, review suggestion 12). */
export const STILL_NEEDED_GATES: string[] = ['m37', 'm46'];

/**
 * "Before X, finish: ..." for a gated quest: while it is not accepted, at least one of its required quests is done and at
 * least one is not. The list is the quest def's own `startWhen`, never a copy, so M46 shows once L11 defines it. A gated
 * quest with no def (not built yet) shows nothing.
 */
export function stillNeededNote(ports: NotePorts, gate: string): { id: string; title: string; lines: string[] } | null {
  const def = ports.questDef(gate);
  if (!def) return null;
  if (ports.questState(gate) !== 'inactive') return null;
  const need = requiredQuests(def.startWhen);
  if (need.length === 0) return null;
  const done = need.filter((q) => ports.questState(q) === 'completed');
  if (done.length === 0 || done.length === need.length) return null;
  const lines = need
    .filter((q) => ports.questState(q) !== 'completed')
    .map((q) => {
      const d = ports.questDef(q);
      return d ? ports.t(d.titleKey) : q;
    });
  return { id: `needed.${gate}`, title: ports.t('hud.journal.needed.title', { quest: ports.t(def.titleKey) }), lines };
}
