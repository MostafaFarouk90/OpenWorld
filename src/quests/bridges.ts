// Small event-to-flag bridges that quest data cannot express. Flag keys live under the story.* prefix thread 6 owns.
import type { BusPort, QuestReader, StatePort, Unsubscribe } from './ports';

/** First `scarecrow.cleared` with method `torch` while R01 is active records that the field was burned. */
export const TORCH_USED_FLAG = 'story.r01.torchUsed';

/** An interactable the quest does not own, whose use must leave a flag the owner reads (thread 3a disables a taken invoice). */
export interface InteractFlagBridge { interactableId: string; quest: string; flag: string }

export function installBridges(
  bus: BusPort, state: StatePort, quests: QuestReader, warn?: (m: string) => void, interactFlags: InteractFlagBridge[] = [],
): Unsubscribe {
  const offs: Unsubscribe[] = [];
  offs.push(bus.on('interact', (p: { interactableId?: unknown; action?: unknown } | null | undefined) => {
    if (!p || p.action === 'mercy') return;
    for (const b of interactFlags) {
      if (p.interactableId !== b.interactableId || quests.state(b.quest) !== 'active') continue;
      try { state.setFlag(b.flag, true); } catch (e) { warn?.(`bridge: could not set ${b.flag}: ${String(e)}`); }
    }
  }));
  offs.push(bus.on('scarecrow.cleared', (p: { method?: unknown } | null | undefined) => {
    if (p?.method !== 'torch' || quests.state('r01') !== 'active') return;
    if (state.getFlag(TORCH_USED_FLAG) === true) return;
    try { state.setFlag(TORCH_USED_FLAG, true); } catch (e) { warn?.(`bridge: could not set ${TORCH_USED_FLAG}: ${String(e)}`); }
  }));
  return () => { for (const o of offs) o(); };
}
