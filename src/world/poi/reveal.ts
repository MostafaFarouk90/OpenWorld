// A chest that exists only while a condition holds (the Fox-Fire buff within 20 m; the fox cache once revealed).
// Interaction's Chest has no external enable hook, so it is created on reveal and disposed on hide. An opened chest
// reads its flag in the constructor and is never re-registered.
export interface ChestHandle {
  dispose(): void;
}

export class RevealedChest {
  private handle: ChestHandle | null = null;

  constructor(
    readonly id: string,
    private readonly make: () => ChestHandle,
    private readonly isOpened: () => boolean,
    private readonly onShow: () => void = () => {},
    private readonly onHide: () => void = () => {},
  ) {}

  get shown(): boolean {
    return this.handle !== null;
  }

  /** Brings the chest in line with `visible`. Returns true when the state changed. */
  sync(visible: boolean): boolean {
    const want = visible && !this.isOpened();
    if (want && !this.handle) {
      this.handle = this.make();
      this.onShow();
      return true;
    }
    if (!want && this.handle) {
      this.handle.dispose();
      this.handle = null;
      this.onHide();
      return true;
    }
    return false;
  }

  dispose(): void {
    this.sync(false);
  }
}
