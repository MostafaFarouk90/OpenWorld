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
  /**
   * v0.5: defers every save while held (stealth sections, the chase; not the mount). The last release runs a save
   * that was deferred meanwhile. Releasing twice is a no-op; the plugin drops holds on teardown.
   */
  suspend(reason: string): () => void;
  /**
   * v0.5: a stealth checkpoint save (reason `zone`). Saves at once when no hold is active (release your own hold
   * first); while another hold is active it defers like any save.
   */
  checkpoint(reason: string): Promise<SaveOutcome>;
}

declare module '../core/Services' {
  interface GameServices {
    save: SaveService;
  }
}
