// G1: when the pause menu opens and closes. Pure: the plugin feeds it DOM and tick input.
//
// - Esc in play opens it at once, except during a tutorial beat, where Esc belongs to hold-to-skip: there a short tap
//   (released within TAP_MS, before the skip could fire) opens it on release.
// - Chrome swallows the Esc keydown that leaves pointer lock, so losing the lock in play opens it too (not in a beat).
// - The `menu` action (gamepad Start in G2) opens it from the input phase. While the menu is up the clock is paused
//   and no fixed tick runs, so closing never goes through actions: Esc keydown, the buttons, or the service's back().
// - After a close, a `menu` press still latched from before is ignored until the key is released.

export const TAP_MS = 350;

export interface PauseMenuHandle {
  readonly page: string;
  readonly capturing: unknown;
  back(): void;
}

export interface PauseControllerDeps {
  /** Play is on: the gameplay context and no other screen up. */
  canOpen(): boolean;
  /** A tutorial beat is running (Esc is its hold-to-skip). */
  beatActive(): boolean;
  setPaused(on: boolean): void;
  now(): number;
  /** Builds and shows the menu; null when the HUD refused (another modal won the race). */
  openMenu(): { menu: PauseMenuHandle; close(): void } | null;
}

export class PauseController {
  private current: { menu: PauseMenuHandle; close(): void } | null = null;
  private escDownAt: number | null = null;
  /** Ignore the `menu` action until it is released (after a close, or when the press opened us through the DOM). */
  private holdMenuAction = false;

  constructor(private readonly deps: PauseControllerDeps) {}

  get isOpen(): boolean {
    return this.current !== null;
  }

  get menu(): PauseMenuHandle | null {
    return this.current?.menu ?? null;
  }

  open(): boolean {
    if (this.current) return true;
    if (!this.deps.canOpen()) return false;
    const opened = this.deps.openMenu();
    if (!opened) return false;
    this.current = opened;
    this.deps.setPaused(true);
    this.holdMenuAction = true;
    return true;
  }

  close(): void {
    const c = this.current;
    if (!c) return;
    this.current = null;
    this.deps.setPaused(false);
    this.holdMenuAction = true;
    try {
      c.close();
    } catch (e) {
      console.error('[settings] closing the pause menu failed', e);
    }
  }

  /** Esc: inside the menu a step back (cancel a capture, leave a sub-page, then resume). */
  back(): void {
    const c = this.current;
    if (!c) return;
    c.menu.back(); // the menu calls resume (close) itself from its main page
  }

  onEscDown(): void {
    if (this.current) {
      this.back();
      return;
    }
    if (this.deps.beatActive()) {
      this.escDownAt = this.deps.now();
      return;
    }
    this.escDownAt = null;
    this.open();
  }

  onEscUp(): void {
    const at = this.escDownAt;
    this.escDownAt = null;
    if (at === null || this.current) return;
    if (this.deps.now() - at <= TAP_MS) this.open();
  }

  onPointerLockLost(): void {
    if (this.current || this.deps.beatActive()) return;
    this.open();
  }

  /** Another screen closed (the map on Esc, say): that same press must not open the menu as well. */
  noteModalClosed(): void {
    this.holdMenuAction = true;
  }

  /** From the input phase each tick: the `menu` action's press and hold. */
  onMenuAction(pressed: boolean, down: boolean): void {
    if (this.holdMenuAction) {
      if (!down && !pressed) this.holdMenuAction = false;
      return;
    }
    if (!pressed || this.current || this.deps.beatActive()) return;
    this.open();
  }
}
