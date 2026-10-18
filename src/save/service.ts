import type { SaveReason } from './SaveSchema';
import type { SaveOutcome } from './SaveManager';

/** The `save` service (provided by thread 6). */
export interface SaveService {
  /** Save now (or defer while unsafe). Never rejects. */
  saveNow(reason: SaveReason): Promise<SaveOutcome>;
  /** A usable save was found at boot. */
  hasSave(): boolean;
  /** Saves live only in memory this session (IndexedDB failed). */
  readonly usingFallback: boolean;
  /** True from the start of a Continue until saves unlock again. */
  readonly loading: boolean;
  /** Applies the boot-time save (the Continue button). Resolves true when a save was applied. */
  continueNow(): Promise<boolean>;
  /** Clears both slots (after backing up a problem save). */
  newGame(): Promise<boolean>;
}

declare module '../core/Services' {
  interface GameServices {
    save: SaveService;
  }
}
