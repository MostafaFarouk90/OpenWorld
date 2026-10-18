import type { GameEvents } from './events';

/** State that save slots carry (contracts/game-events-and-flags.md section 7). */
export interface Persistable {
  key: string;
  /** Data format version; the only version field (the data itself carries none). */
  version: number;
  serialize(): unknown;
  load(data: unknown, version: number): void;
}

/** One stored entry of a save slot. */
export interface SaveEntry {
  key: string;
  version: number;
  data: unknown;
}

export class PersistRegistry {
  private readonly items = new Map<string, Persistable>();
  /** Keys whose last load was refused as too new; `saveAll` writes their previous entry back unchanged. */
  private readonly refused = new Set<string>();

  constructor(private readonly warn: (message: string, err?: unknown) => void = (m, e) => console.warn(m, e ?? '')) {}

  register(p: Persistable): () => void {
    if (this.items.has(p.key)) throw new Error(`Persist: key "${p.key}" is already registered`);
    if (!Number.isInteger(p.version) || p.version < 1) throw new Error(`Persist: "${p.key}" needs an integer version >= 1`);
    this.items.set(p.key, p);
    return () => {
      if (this.items.get(p.key) === p) this.items.delete(p.key);
    };
  }

  get(key: string): Persistable | undefined {
    return this.items.get(key);
  }

  all(): readonly Persistable[] {
    return [...this.items.values()];
  }

  /**
   * Serialises every persistable. `previous` (the entries of the slot being overwritten) supplies the
   * value for keys whose serializer throws, for keys with no registered persistable, and for keys whose
   * load was refused as too new, kept verbatim.
   */
  saveAll(previous: readonly SaveEntry[] = []): SaveEntry[] {
    const old = new Map(previous.map((e) => [e.key, e]));
    const out: SaveEntry[] = [];
    for (const p of this.items.values()) {
      const prevEntry = old.get(p.key);
      if (this.refused.has(p.key) && prevEntry) {
        out.push(prevEntry);
        continue;
      }
      try {
        out.push({ key: p.key, version: p.version, data: p.serialize() });
      } catch (err) {
        this.warn(`Persist: serialize "${p.key}" failed; keeping its previous entry`, err);
        const prev = old.get(p.key);
        if (prev) out.push(prev);
      }
    }
    for (const e of previous) if (!this.items.has(e.key)) out.push(e);
    return out;
  }

  /**
   * Loads `entries` into the registered persistables, then emits `save.loaded`. Newer versions are refused
   * (the owner keeps its defaults); a throwing load is isolated. Returns the entries with no owner and the
   * refused ones, which the caller keeps and passes to the next `saveAll` as `previous`.
   */
  loadAll(entries: readonly SaveEntry[], events: GameEvents, slot: string): SaveEntry[] {
    const unknown: SaveEntry[] = [];
    this.refused.clear();
    for (const e of entries) {
      const p = this.items.get(e.key);
      if (!p) {
        unknown.push(e);
        continue;
      }
      if (!Number.isInteger(e.version) || e.version > p.version) {
        this.warn(`Persist: "${e.key}" was saved as version ${e.version}, newer than ${p.version}; keeping defaults`);
        // Returned with the unknown entries and kept verbatim by the next save, so a rollback loses nothing.
        unknown.push(e);
        this.refused.add(e.key);
        continue;
      }
      try {
        p.load(e.data, e.version);
      } catch (err) {
        this.warn(`Persist: load "${e.key}" failed; keeping defaults`, err);
      }
    }
    events.emit('save.loaded', { slot });
    return unknown;
  }
}
