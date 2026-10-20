// Objective-to-flag bridge: a story flag set the moment an objective is done, for systems that gate on flags (a
// spawner's activation, a fire that goes out, an NPC walk-off). Flags persist, so a load needs nothing; `sync()`
// covers saves made before a flag existed.
import type { BusPort, QuestReader, StatePort, Unsubscribe } from './ports';
import type { FlagValue } from './types';

/**
 * `objective` absent: a quest-level row, set once the quest has started (active or completed). `value` absent: the
 * flag is set true; with a value it is written only while the flag is still unset (another route may have set it).
 */
export interface ObjectiveFlag { quest: string; objective?: string; flag: string; value?: FlagValue }

export function installObjectiveFlags(
  table: readonly ObjectiveFlag[], bus: BusPort, state: StatePort, quests: QuestReader, warn?: (m: string) => void,
): { sync(): void; dispose: Unsubscribe } {
  const set = (f: ObjectiveFlag): void => {
    const now = state.getFlag(f.flag);
    if (f.value === undefined ? now === true : now !== undefined) return;
    try { state.setFlag(f.flag, f.value ?? true); } catch (e) { warn?.(`objective flags: could not set ${f.flag}: ${String(e)}`); }
  };
  const sync = (): void => {
    for (const f of table) {
      // a completed quest counts every objective done (its runtime keeps no progress for skipped ones)
      const st = quests.state(f.quest);
      if (st === 'completed' || (f.objective === undefined ? st === 'active' : quests.objectiveDone(f.quest, f.objective))) set(f);
    }
  };
  const offStart = bus.on('quest.started', (e: { questId?: unknown } | null | undefined) => {
    for (const f of table) if (f.objective === undefined && f.quest === e?.questId) set(f);
  });
  const off = bus.on('quest.objective', (e: { questId?: unknown; objectiveId?: unknown; done?: unknown } | null | undefined) => {
    if (!e?.done) return;
    for (const f of table) if (f.objective !== undefined && f.quest === e.questId && f.objective === e.objectiveId) set(f);
  });
  const offDone = bus.on('quest.completed', () => sync());
  return { sync, dispose: () => { off(); offDone(); offStart(); } };
}
