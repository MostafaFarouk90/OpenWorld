import type { MercyCounts } from './service';

export interface CodexSave {
  unlocked: string[];
  read: string[];
}

/** Unlock and read state. Persists only ids; the mercy tally belongs to the enemies thread. */
export class CodexModel {
  private readonly unlocked = new Set<string>();
  private readonly read = new Set<string>();

  unlock(id: string): boolean {
    if (typeof id !== 'string' || id === '' || this.unlocked.has(id)) return false;
    this.unlocked.add(id);
    return true;
  }

  has(id: string): boolean {
    return this.unlocked.has(id);
  }

  markRead(id: string): void {
    if (this.unlocked.has(id)) this.read.add(id);
  }

  isRead(id: string): boolean {
    return this.read.has(id);
  }

  serialize(): CodexSave {
    return { unlocked: [...this.unlocked], read: [...this.read] };
  }

  /** Defensive: unknown string ids are kept, other types dropped with a warning, a bad payload is ignored. */
  load(data: unknown, warn: (msg: string) => void = () => {}): void {
    this.unlocked.clear();
    this.read.clear();
    if (typeof data !== 'object' || data === null || Array.isArray(data)) {
      if (data !== undefined) warn('codex: save payload is not an object; starting empty');
      return;
    }
    const d = data as Record<string, unknown>;
    const take = (field: 'unlocked' | 'read', into: Set<string>) => {
      const raw = d[field];
      if (raw === undefined) return;
      if (!Array.isArray(raw)) {
        warn(`codex: '${field}' is not an array; ignored`);
        return;
      }
      let dropped = 0;
      for (const v of raw) {
        if (typeof v === 'string' && v !== '') into.add(v);
        else dropped++;
      }
      if (dropped > 0) warn(`codex: dropped ${dropped} invalid id(s) from '${field}'`);
    };
    take('unlocked', this.unlocked);
    take('read', this.read);
    // Read implies unlocked; a stray read id is kept as unlocked so it is never shown masked.
    for (const id of this.read) this.unlocked.add(id);
  }
}

const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.floor(v) : 0);

/** Normalises whatever `enemies.mercyTally()` returns (record or map of kind to counts) into counts per kind. */
export function normaliseTally(raw: unknown): Map<string, MercyCounts> {
  const out = new Map<string, MercyCounts>();
  if (raw === null || typeof raw !== 'object') return out;
  const entries: [unknown, unknown][] = raw instanceof Map ? [...raw.entries()] : Object.entries(raw);
  for (const [kind, c] of entries) {
    if (typeof kind !== 'string' || typeof c !== 'object' || c === null) continue;
    const r = c as Record<string, unknown>;
    out.set(kind, { release: num(r.release), spare: num(r.spare), calm: num(r.calm), killed: num(r.killed) });
  }
  return out;
}

export const ZERO_COUNTS: MercyCounts = Object.freeze({ release: 0, spare: 0, calm: 0, killed: 0 });
