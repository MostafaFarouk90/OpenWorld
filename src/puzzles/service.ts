import type { PressureTimer } from './PressureTimer';

export interface PuzzleRegistration {
  timer?: PressureTimer;
  /** Called when the room is abandoned (death, travel, a load) so the puzzle can reset with no penalty. */
  onAbort?(reason: 'death' | 'travel' | 'load'): void;
}

export interface PuzzlesService {
  /** The running pressure clock for HUD and puzzle code, or null when the puzzle has none running. */
  pressure(id: string): { remaining: number; total: number } | null;
  /** Registers a puzzle's timer and abort hook. A duplicate id throws. Returns the unregister. */
  register(id: string, reg: PuzzleRegistration): () => void;
}

declare module '../core/Services' {
  interface GameServices {
    puzzles: PuzzlesService;
  }
}
