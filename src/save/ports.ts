/**
 * Local port interfaces for the save layer. The real game framework is not on main yet, so
 * src/save/ depends only on these structural types; a later step wires real objects to them.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/** Mirrors the contract (game-events-and-flags section 7) Persistable. */
export interface Persistable {
  key: string;
  version: number;
  serialize(): unknown;
  load(data: unknown, version: number): void;
}

export interface GameplaySafety {
  safe: boolean;
  /** Why saving is unsafe: 'dead', 'cutscene', 'dialogue', 'travelling', ... */
  reason?: string;
}

export interface SavePorts {
  persistables(): readonly Persistable[];
  /** Emits save.loaded { slot }. Called by the load orchestrator, never by SaveManager itself. */
  emitLoaded(slot: string): void;
  now(): number;
  log(level: LogLevel, msg: string, ctx?: unknown): void;
  /** False while dead, in a cutscene, in dialogue or travelling. */
  gameplaySafe(): GameplaySafety;
  /** Data of the 'player-position' entry: the last grounded position (never mid-travel). */
  groundedPlayerState(): unknown;
  /** Show a toast by string key (e.g. 'save.quota', 'save.unavailable'). */
  toast(key: string): void;
}
