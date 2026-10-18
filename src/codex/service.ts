import type { CodexEntryDef } from './entries';

/** The `codex` service (contracts/game-events-and-flags.md section 6, provided by thread 8). */
export type { CodexEntryDef };
export interface CodexService {
  /** Unlocks an entry id (idempotent). Unknown ids are kept so a later build can show them. */
  unlock(entryId: string): void;
  has(entryId: string): boolean;
  /** Opens the codex modal, optionally on an entry. A no-op while another modal is open. */
  open(entryId?: string): void;
  /**
   * Adds entries (typically how-to entries for a class's skills). Built-ins come first, then
   * registered entries in registration order. The codex only reads `codex.<tab>.<slug>.name` and
   * `.body` (the def's nameKey/bodyKey): the caller registers those strings through `ctx.strings`.
   * Ids must be unique across built-in and registered entries; a duplicate or invalid def is
   * skipped with a console.warn and the rest still added. An id already unlocked (before or after
   * registering) shows unlocked. `{key}` in the body is filled from the def's optional `action`.
   * Returns an idempotent dispose that removes exactly the entries this call added.
   */
  register(entries: readonly CodexEntryDef[]): () => void;
}

declare module '../core/Services' {
  interface GameServices {
    codex: CodexService;
  }
}

/** Per-kind mercy counts as `enemies.mercyTally()` reports them (thread 1). */
export interface MercyCounts {
  release: number;
  spare: number;
  calm: number;
  killed: number;
}
