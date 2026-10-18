import type { QuestsService } from '../quests/service';

/** A quest window: from `liveFrom` being current (or done) until `liveUntil` is done. */
export interface QuestWindow {
  id: string;
  liveFrom: string;
  liveUntil: string;
}

/**
 * Quest-derived liveness (ruling 3, no flags). Live while the quest is active, `liveUntil` is not done, and
 * `liveFrom` is current or done, so a sequential quest never opens a section or the chase before its objective.
 */
export function questLive(quests: Pick<QuestsService, 'state' | 'objectiveDone' | 'isObjectiveCurrent'> | undefined, w: QuestWindow): boolean {
  if (!quests) return false;
  try {
    if (quests.state(w.id) !== 'active' || quests.objectiveDone(w.id, w.liveUntil)) return false;
    return quests.objectiveDone(w.id, w.liveFrom) || quests.isObjectiveCurrent(w.id, w.liveFrom);
  } catch {
    return false;
  }
}

/** Every listed objective is done (M09's exit arms once the invoices objective is done). */
export function objectivesDone(quests: Pick<QuestsService, 'objectiveDone'> | undefined, questId: string, ids: readonly string[] | undefined): boolean {
  if (!ids || ids.length === 0) return true;
  if (!quests) return false;
  try {
    return ids.every((o) => quests.objectiveDone(questId, o));
  } catch {
    return false;
  }
}
