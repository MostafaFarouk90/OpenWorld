// Small event-to-flag bridges that quest data cannot express. Flag keys live under the story.* prefix thread 6 owns.
import type { BusPort, QuestReader, StatePort, Unsubscribe } from './ports';

/** First `scarecrow.cleared` with method `torch` while R01 is active records that the field was burned. */
export const TORCH_USED_FLAG = 'story.r01.torchUsed';

/** R01's field follows the majority of the clears (a tie saves it); counted per method, decided on the last one. */
export const R01_TORCH_CLEARS = 'story.r01.torchClears';
export const R01_SURGE_CLEARS = 'story.r01.surgeClears';
export const R01_SCORCHED = 'story.r01.scorched';
export const R01_AFTERMATH = 'story.r01.aftermathDone';
export const R01_REQUIRED = 8;
export const R01_STAKE_FLAGS = [1, 2, 3].map((n) => `story.r01.stake.${n}`);
export const R01_BUCKET_FLAGS = [1, 2].map((n) => `story.r01.bucket${n}.delivered`);
/** M04's Toll Sergeant: 'spared' or 'killed', read by Gaut's report. */
export const M04_SERGEANT = 'story.m04.sergeant';

/** An interactable the quest does not own, whose use must leave a flag the owner reads (thread 3a disables a taken invoice). */
export interface InteractFlagBridge { interactableId: string; quest: string; objective: string; flag: string }

export function installBridges(
  bus: BusPort, state: StatePort, quests: QuestReader & { isObjectiveCurrent?(q: string, o: string): boolean }, warn?: (m: string) => void,
  interactFlags: InteractFlagBridge[] = [],
): Unsubscribe {
  const offs: Unsubscribe[] = [];
  offs.push(bus.on('interact', (p: { interactableId?: unknown; action?: unknown } | null | undefined) => {
    if (!p || p.action === 'mercy') return;
    for (const b of interactFlags) {
      if (p.interactableId !== b.interactableId || quests.state(b.quest) !== 'active') continue;
      if (quests.isObjectiveCurrent && !quests.isObjectiveCurrent(b.quest, b.objective)) continue; // an invoice that earns nothing must stay usable
      try { state.setFlag(b.flag, true); } catch (e) { warn?.(`bridge: could not set ${b.flag}: ${String(e)}`); }
    }
  }));
  offs.push(bus.on('scarecrow.cleared', (p: { method?: unknown } | null | undefined) => {
    if (p?.method !== 'torch' || quests.state('r01') !== 'active') return;
    if (state.getFlag(TORCH_USED_FLAG) === true) return;
    try { state.setFlag(TORCH_USED_FLAG, true); } catch (e) { warn?.(`bridge: could not set ${TORCH_USED_FLAG}: ${String(e)}`); }
  }));
  const set = (k: string, v: boolean | number | string): void => {
    try { state.setFlag(k, v); } catch (e) { warn?.(`bridge: could not set ${k}: ${String(e)}`); }
  };
  const num = (k: string): number => { const v = state.getFlag(k); return typeof v === 'number' ? v : 0; };
  /**
   * Decided once all the clears are counted, whichever of the last clear and the objective credit is heard first; a
   * save whose clears were not all counted decides once the root fight is done (or on load past it).
   */
  const decideField = (): void => {
    if (quests.state('r01') !== 'active' || !quests.objectiveDone('r01', 'o2') || state.getFlag(R01_SCORCHED) !== undefined) return;
    const torch = num(R01_TORCH_CLEARS);
    const surge = num(R01_SURGE_CLEARS);
    if (torch + surge < R01_REQUIRED && !quests.objectiveDone('r01', 'root')) return;
    // a save from before the counts existed has only the any-torch flag to go on
    const legacy = torch === 0 && surge === 0 && state.getFlag(TORCH_USED_FLAG) === true;
    set(R01_SCORCHED, legacy || torch > surge);
  };
  const aftermath = (): void => {
    if (quests.state('r01') !== 'active' || state.getFlag(R01_AFTERMATH) === true) return;
    const scorched = state.getFlag(R01_SCORCHED) === true;
    const flags = scorched ? R01_BUCKET_FLAGS : R01_STAKE_FLAGS;
    if (!flags.every((k) => state.getFlag(k) === true)) return;
    if (scorched) set('story.r01.stubbleOut', true);
    set(R01_AFTERMATH, true);
  };
  offs.push(bus.on('scarecrow.cleared', (p: { method?: unknown } | null | undefined) => {
    if (quests.state('r01') !== 'active' || state.getFlag(R01_SCORCHED) !== undefined) return;
    const key = p?.method === 'torch' ? R01_TORCH_CLEARS : R01_SURGE_CLEARS;
    set(key, num(key) + 1);
    decideField();
  }));
  offs.push(bus.on('quest.objective', (e: { questId?: unknown } | null | undefined) => { if (e?.questId === 'r01') decideField(); }));
  offs.push(bus.on('flag.changed', (e: { key?: unknown } | null | undefined) => {
    if (typeof e?.key === 'string' && (R01_STAKE_FLAGS.includes(e.key) || R01_BUCKET_FLAGS.includes(e.key))) aftermath();
  }));
  offs.push(bus.on('save.loaded', () => { decideField(); aftermath(); }));
  // M04's sergeant: a Spare or a death, whichever comes first
  offs.push(bus.on('mercy', (e: { creature?: unknown; verb?: unknown } | null | undefined) => {
    if (e?.creature === 'toll-sergeant' && e.verb === 'spare' && state.getFlag(M04_SERGEANT) === undefined) set(M04_SERGEANT, 'spared');
  }));
  offs.push(bus.on('actor.died', (e: { kind?: unknown } | null | undefined) => {
    if (e?.kind === 'toll-sergeant' && state.getFlag(M04_SERGEANT) === undefined) set(M04_SERGEANT, 'killed');
  }));
  return () => { for (const o of offs) o(); };
}
