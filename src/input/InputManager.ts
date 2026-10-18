import { ActionMap } from './ActionMap';
import type { SampledActions } from './ActionMap';
import { InputBindings, safeLocalStorage } from './InputBindings';
import { InputContexts } from './InputContexts';
import { NO_ACTIONS } from './actions';
import type { Action, ActionState } from './actions';

/** Input state as seen by one fixed simulation tick. */
export interface InputSnapshot {
  /** Strafe axis: -1 left, +1 right. */
  moveRight: number;
  /** Forward axis: -1 back, +1 forward. */
  moveForward: number;
  sprint: boolean;
  /** True on exactly one tick per press, even if the key went down and up between ticks. */
  jump: boolean;
  /**
   * Attack request on this tick, edge-triggered like `jump`: 0 none, 1 primary (left mouse button
   * while pointer-locked, or key 1), 2-4 the alternate attacks on keys 2-4.
   */
  attack: number;
}

/**
 * Keyboard and mouse state. Keys are sampled once per fixed tick (`sample`) so simulation input
 * stays deterministic; mouse movement accumulates until the camera consumes it each frame.
 * Clicking the canvas requests pointer lock for mouse look.
 */
/** The parts of `document` the input manager needs; injectable for tests. */
export type PointerLockDocument = EventTarget & { readonly pointerLockElement: Element | null };

export interface InputManagerOptions {
  storage?: Pick<Storage, 'getItem' | 'setItem'> | null;
}

const ATTACKS: readonly Action[] = ['attack1', 'attack2', 'attack3', 'attack4'];

type KeyboardLockApi = { lock?(codes?: string[]): Promise<void>; unlock?(): void };

export class InputManager {
  readonly bindings: InputBindings;
  readonly contexts = new InputContexts();
  readonly actionMap: ActionMap;
  /** True while `navigator.keyboard.lock` is active (Ctrl+W and friends reach the game). */
  private lockedState = false;
  private readonly lockListeners = new Set<(state: { supported: boolean; locked: boolean }) => void>();
  private latest: ActionState = NO_ACTIONS;
  private mouseDX = 0;
  private mouseDY = 0;
  private wheel = 0;
  private unsubscribeBindings: () => void;

  /** `win` and `doc` default to the page's window and document; tests pass stand-ins. */
  constructor(
    private readonly element: HTMLElement,
    private readonly win: EventTarget = window,
    private readonly doc: PointerLockDocument = document,
    opts: InputManagerOptions = {},
  ) {
    const storage = opts.storage !== undefined ? opts.storage : typeof window !== 'undefined' ? safeLocalStorage() : null;
    this.bindings = new InputBindings(storage);
    this.actionMap = new ActionMap(this.bindings, this.contexts, { pointerLocked: () => this.pointerLocked });
    this.unsubscribeBindings = this.bindings.onChange(() => {
      if (this.keyboardLocked) void this.applyKeyboardLock();
    });
    win.addEventListener('keydown', this.onKeyDown as EventListener);
    win.addEventListener('keyup', this.onKeyUp as EventListener);
    win.addEventListener('blur', this.onBlur);
    win.addEventListener('mouseup', this.onMouseUp as EventListener);
    element.addEventListener('click', this.onClick);
    element.addEventListener('mousedown', this.onMouseDown);
    element.addEventListener('mouseup', this.onMouseUp as EventListener);
    element.addEventListener('auxclick', this.onAuxClick as EventListener);
    element.addEventListener('contextmenu', this.onContextMenu as EventListener);
    doc.addEventListener('mousemove', this.onMouseMove as EventListener);
    doc.addEventListener('fullscreenchange', this.onFullscreenChange);
    element.addEventListener('wheel', this.onWheel, { passive: true });
  }

  get keyboardLocked(): boolean {
    return this.lockedState;
  }

  set keyboardLocked(v: boolean) {
    if (v === this.lockedState) return;
    this.lockedState = v;
    const state = { supported: this.keyboardLockSupported, locked: v };
    for (const l of [...this.lockListeners]) {
      try {
        l(state);
      } catch (e) {
        console.error('InputManager: keyboard lock listener failed', e);
      }
    }
  }

  /** True when `navigator.keyboard.lock` exists and fullscreen is available. */
  get keyboardLockSupported(): boolean {
    if (typeof this.keyboardApi()?.lock !== 'function') return false;
    const fsEnabled = (this.doc as unknown as { fullscreenEnabled?: boolean }).fullscreenEnabled;
    return fsEnabled !== false && typeof this.element.requestFullscreen === 'function';
  }

  /** Fires whenever `keyboardLocked` changes. Returns an unsubscribe function. */
  onKeyboardLockChange(listener: (state: { supported: boolean; locked: boolean }) => void): () => void {
    this.lockListeners.add(listener);
    return () => this.lockListeners.delete(listener);
  }

  get pointerLocked(): boolean {
    return this.doc.pointerLockElement === this.element;
  }

  /** The actions sampled by the latest `sampleTick` (NO_ACTIONS before the first). */
  get latestActions(): ActionState {
    return this.latest;
  }

  /** Samples the action map once and derives the legacy snapshot from it. */
  sampleTick(): { snapshot: InputSnapshot; actions: ActionState } {
    const actions: SampledActions = this.actionMap.sample();
    this.latest = actions;
    let attack = 0;
    let best = 0;
    ATTACKS.forEach((a, i) => {
      if (!actions.pressed(a)) return;
      const seq = actions.pressSeq(a);
      if (seq >= best) {
        best = seq;
        attack = i + 1;
      }
    });
    const snapshot: InputSnapshot = {
      moveRight: actions.axis('moveLeft', 'moveRight'),
      moveForward: actions.axis('moveBack', 'moveForward'),
      sprint: actions.down('sprint'),
      jump: actions.pressed('jump'),
      attack,
    };
    return { snapshot, actions };
  }

  sample(): InputSnapshot {
    return this.sampleTick().snapshot;
  }

  /** Mouse movement in pixels since the last call (only while pointer-locked). */
  consumeMouseDelta(): { dx: number; dy: number } {
    const d = { dx: this.mouseDX, dy: this.mouseDY };
    this.mouseDX = 0;
    this.mouseDY = 0;
    return d;
  }

  /** Wheel scroll since the last call, in normalized steps (positive = away from the player). */
  consumeWheel(): number {
    const w = this.wheel;
    this.wheel = 0;
    return w;
  }

  /** Requests fullscreen, then locks every bound key except Escape. Never throws. */
  async requestFullscreenAndLock(target: HTMLElement = this.element): Promise<boolean> {
    try {
      try {
        await target.requestFullscreen?.();
      } catch {
        // Fullscreen refused: keyboard lock may still work in some browsers.
      }
      return await this.applyKeyboardLock();
    } catch {
      return false;
    }
  }

  /** Releases the keyboard lock (no-op when not locked). */
  unlockKeyboard(): void {
    if (!this.lockedState) return;
    this.keyboardLocked = false;
    try {
      this.keyboardApi()?.unlock?.();
    } catch {
      // ignore
    }
  }

  dispose(): void {
    this.unsubscribeBindings();
    this.lockListeners.clear();
    this.win.removeEventListener('keydown', this.onKeyDown as EventListener);
    this.win.removeEventListener('keyup', this.onKeyUp as EventListener);
    this.win.removeEventListener('blur', this.onBlur);
    this.win.removeEventListener('mouseup', this.onMouseUp as EventListener);
    this.element.removeEventListener('click', this.onClick);
    this.element.removeEventListener('mousedown', this.onMouseDown);
    this.element.removeEventListener('mouseup', this.onMouseUp as EventListener);
    this.element.removeEventListener('auxclick', this.onAuxClick as EventListener);
    this.element.removeEventListener('contextmenu', this.onContextMenu as EventListener);
    this.doc.removeEventListener('mousemove', this.onMouseMove as EventListener);
    this.doc.removeEventListener('fullscreenchange', this.onFullscreenChange);
    this.element.removeEventListener('wheel', this.onWheel);
  }

  private keyboardApi(): KeyboardLockApi | undefined {
    try {
      return typeof navigator === 'undefined' ? undefined : (navigator as unknown as { keyboard?: KeyboardLockApi }).keyboard;
    } catch {
      return undefined;
    }
  }

  private async applyKeyboardLock(): Promise<boolean> {
    try {
      const kb = this.keyboardApi();
      if (!kb?.lock) return false;
      await kb.lock(this.bindings.boundKeyCodes().filter((c) => c !== 'Escape'));
      this.keyboardLocked = true;
      return true;
    } catch {
      this.keyboardLocked = false;
      return false;
    }
  }

  private onFullscreenChange = (): void => {
    const fs = (this.doc as unknown as { fullscreenElement?: Element | null }).fullscreenElement;
    if (!fs && this.keyboardLocked) {
      this.keyboardLocked = false;
      try {
        this.keyboardApi()?.unlock?.();
      } catch {
        // ignore
      }
    }
  };

  private onKeyDown = (e: KeyboardEvent): void => {
    const code = e.code;
    if (code === 'Space' || code.startsWith('Arrow')) e.preventDefault();
    else if (this.pointerLocked) {
      const bound = this.bindings.actionsFor({ device: 'key', code }).length > 0;
      if (code === 'Tab' || code === 'AltLeft' || (e.ctrlKey && bound)) e.preventDefault();
    }
    this.actionMap.keyDown(code, e.repeat);
  };

  private onKeyUp = (e: KeyboardEvent): void => {
    this.actionMap.keyUp(e.code);
  };

  private onBlur = (): void => {
    this.actionMap.blur();
  };

  private onClick = (): void => {
    if (this.pointerLocked) return;
    // Chrome returns a promise that rejects if the lock is refused (e.g. clicked right after Esc).
    const request = this.element.requestPointerLock() as Promise<void> | undefined;
    request?.catch(() => {});
  };

  private onMouseDown = (e: MouseEvent): void => {
    if (e.button === 3 || e.button === 4) e.preventDefault?.();
    this.actionMap.mouseDown(e.button);
  };

  private onMouseUp = (e: MouseEvent): void => {
    if (e.button === 3 || e.button === 4) e.preventDefault?.();
    this.actionMap.mouseUp(e.button);
  };

  private onAuxClick = (e: MouseEvent): void => {
    if (e.button === 3 || e.button === 4) e.preventDefault?.();
  };

  private onContextMenu = (e: Event): void => {
    e.preventDefault?.();
  };

  private onMouseMove = (e: MouseEvent): void => {
    if (!this.pointerLocked) return;
    this.mouseDX += e.movementX;
    this.mouseDY += e.movementY;
  };

  private onWheel = (e: WheelEvent): void => {
    this.wheel += Math.sign(e.deltaY);
  };
}
