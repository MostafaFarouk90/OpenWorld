// Small event-to-flag bridges that quest data cannot express. Flag keys live under the story.* prefix thread 6 owns.
import type { BusPort, QuestReader, StatePort, Unsubscribe } from './ports';

/** First `scarecrow.cleared` with method `torch` while R01 is active records that the field was burned. */
export const TORCH_USED_FLAG = 'story.r01.torchUsed';

export function installBridges(bus: BusPort, state: StatePort, quests: QuestReader, warn?: (m: string) => void): Unsubscribe {
  const offs: Unsubscribe[] = [];
  offs.push(bus.on('scarecrow.cleared', (p: { method?: unknown } | null | undefined) => {
    if (p?.method !== 'torch' || quests.state('r01') !== 'active') return;
    if (state.getFlag(TORCH_USED_FLAG) === true) return;
    try { state.setFlag(TORCH_USED_FLAG, true); } catch (e) { warn?.(`bridge: could not set ${TORCH_USED_FLAG}: ${String(e)}`); }
  }));
  return () => { for (const o of offs) o(); };
}
