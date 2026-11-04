import type { BusPort, Unsubscribe } from '../../ports';

/**
 * A side job's completion lights its codex lore entry (j03: finding both stones). The unlock is idempotent in the codex, so a
 * quest completed twice (it cannot be) or a load that replays the event does no harm; an old save with the job completed
 * but the entry missing is not repaired (jobs are new, so no such save exists).
 */
export function installSideCodex(bus: BusPort, table: Record<string, string>, unlock: (id: string) => void, warn?: (m: string) => void): Unsubscribe {
  return bus.on('quest.completed', (e: { questId?: unknown } | null | undefined) => {
    const id = typeof e?.questId === 'string' ? table[e.questId] : undefined;
    if (!id) return;
    try { unlock(id); } catch (err) { warn?.(`side codex ${id}: ${String(err)}`); }
  });
}
