import type { SaveFile, SaveReason } from './SaveSchema';
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
  /**
   * Dev builds only (K16, the `?act3=` fixtures): applies a save file held in memory as Continue does, without reading or
   * writing either slot. Resolves false in production, for a malformed file, or when the apply fails.
   */
  loadFile?(raw: unknown): Promise<boolean>;
  /**
   * G1: whether a save asked for now would be written at once (not deferred, dropped or refused). The pause menu greys
   * "Save game" and warns on "Quit to title" when it is false.
   */
  canSaveNow?(): boolean;
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
  /**
   * G3 (New Game+): an extra button on the boot Continue modal, shown when `when()` holds as the modal opens. With
   * `confirmKey` the modal asks first. Returns the undo.
   */
  addBootChoice?(choice: BootChoice): () => void;
  /** G3: the save the boot read found, while it is not yet applied (null after Continue, New Game or a switch). */
  bootFile?(): SaveFile | null;
  /** G3: the parked world (slot-0.parked) the boot read found, or null. */
  parkedFile?(): SaveFile | null;
  /**
   * G3: parks `away` and makes `next` the save, in one write. Before the boot decision it also applies `next` (as
   * Continue does); after it, the caller reloads the page (`?continue`) so the world starts from defaults. Resolves false
   * when the write failed (nothing changed).
   */
  switchWorld?(away: SaveFile, next: SaveFile): Promise<boolean>;
  /** G3: the live state as a save file (refused, null, while a load runs). */
  snapshotFile?(): SaveFile | null;
}

export interface BootChoice {
  id: string;
  labelKey: string;
  when(): boolean;
  run(): void;
  confirmKey?: string;
}

declare module '../core/Services' {
  interface GameServices {
    save: SaveService;
  }
}
