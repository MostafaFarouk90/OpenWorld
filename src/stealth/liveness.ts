import type { QuestsService } from '../quests/service';

/** Quest-derived liveness (ruling 3, no flags): the quest is active and `until` is not done. */
export function questLive(quests: QuestsService | undefined, questId: string, until: string): boolean {
  if (!quests) return false;
  try {
    return quests.state(questId) === 'active' && !quests.objectiveDone(questId, until);
  } catch {
    return false;
  }
}

/** Every listed objective is done (M09's exit arms once the three invoices are copied). */
export function objectivesDone(quests: QuestsService | undefined, questId: string, ids: readonly string[] | undefined): boolean {
  if (!ids || ids.length === 0) return true;
  if (!quests) return false;
  try {
    return ids.every((o) => quests.objectiveDone(questId, o));
  } catch {
    return false;
  }
}
