/** The `codex` service (contracts/game-events-and-flags.md section 6, provided by thread 8). */
export interface CodexService {
  /** Unlocks an entry id (idempotent). Unknown ids are kept so a later build can show them. */
  unlock(entryId: string): void;
  has(entryId: string): boolean;
  /** Opens the codex modal, optionally on an entry. A no-op while another modal is open. */
  open(entryId?: string): void;
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
