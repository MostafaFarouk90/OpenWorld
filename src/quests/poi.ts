import type { Effect } from './types';
import type { BusPort, StatePort, Unsubscribe } from './ports';
import type { PoiReward } from './content/poi';

export interface PoiPorts {
  bus: BusPort;
  state: StatePort;
  run(effects: Effect[]): void;
  codexUnlock?(id: string): void;
  warn?(m: string): void;
}

/** Applies a POI reward once per interactable, tracked by a flag so a reload cannot repeat it. */
export function installPoiRewards(table: PoiReward[], p: PoiPorts): Unsubscribe {
  const byId = new Map(table.map((r) => [r.interactableId, r]));
  return p.bus.on('interact', (e: { interactableId?: unknown } | null | undefined) => {
    const r = typeof e?.interactableId === 'string' ? byId.get(e.interactableId) : undefined;
    if (!r || p.state.getFlag(r.onceFlag) === true) return;
    try {
      p.state.setFlag(r.onceFlag, true);
      p.run(r.effects);
      if (r.codexId) p.codexUnlock?.(r.codexId);
    } catch (err) {
      p.warn?.(`poi ${r.interactableId}: ${String(err)}`);
    }
  });
}
