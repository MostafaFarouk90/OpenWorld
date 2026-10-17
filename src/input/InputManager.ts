/** Input state as seen by one fixed simulation tick. */
export interface InputSnapshot {
  /** Strafe axis: -1 left, +1 right. */
  moveRight: number;
  /** Forward axis: -1 back, +1 forward. */
  moveForward: number;
  sprint: boolean;
  /** True on exactly one tick per press, even if the key went down and up between ticks. */
  jump: boolean;
}

const FORWARD = ['KeyW', 'ArrowUp'];
const BACK = ['KeyS', 'ArrowDown'];
const LEFT = ['KeyA', 'ArrowLeft'];
const RIGHT = ['KeyD', 'ArrowRight'];
const SPRINT = ['ShiftLeft', 'ShiftRight'];
const JUMP = ['Space'];

/**
 * Keyboard and mouse state. Keys are sampled once per fixed tick (`sample`) so simulation input
 * stays deterministic; mouse movement accumulates until the camera consumes it each frame.
 * Clicking the canvas requests pointer lock for mouse look.
 */
/** The parts of `document` the input manager needs; injectable for tests. */
export type PointerLockDocument = EventTarget & { readonly pointerLockElement: Element | null };

export class InputManager {
  private readonly down = new Set<string>();
  private jumpQueued = false;
  private mouseDX = 0;
  private mouseDY = 0;
  private wheel = 0;

  /** `win` and `doc` default to the page's window and document; tests pass stand-ins. */
  constructor(
    private readonly element: HTMLElement,
    private readonly win: EventTarget = window,
    private readonly doc: PointerLockDocument = document,
  ) {
    win.addEventListener('keydown', this.onKeyDown as EventListener);
    win.addEventListener('keyup', this.onKeyUp as EventListener);
    win.addEventListener('blur', this.onBlur);
    element.addEventListener('click', this.onClick);
    doc.addEventListener('mousemove', this.onMouseMove as EventListener);
    element.addEventListener('wheel', this.onWheel, { passive: true });
  }

  get pointerLocked(): boolean {
    return this.doc.pointerLockElement === this.element;
  }

  sample(): InputSnapshot {
    const axis = (neg: string[], pos: string[]) => (this.any(pos) ? 1 : 0) - (this.any(neg) ? 1 : 0);
    const jump = this.jumpQueued;
    this.jumpQueued = false;
    return {
      moveRight: axis(LEFT, RIGHT),
      moveForward: axis(BACK, FORWARD),
      sprint: this.any(SPRINT),
      jump,
    };
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

  dispose(): void {
    this.win.removeEventListener('keydown', this.onKeyDown as EventListener);
    this.win.removeEventListener('keyup', this.onKeyUp as EventListener);
    this.win.removeEventListener('blur', this.onBlur);
    this.element.removeEventListener('click', this.onClick);
    this.doc.removeEventListener('mousemove', this.onMouseMove as EventListener);
    this.element.removeEventListener('wheel', this.onWheel);
  }

  private any(codes: string[]): boolean {
    return codes.some((c) => this.down.has(c));
  }

  private onKeyDown = (e: KeyboardEvent): void => {
    if (JUMP.includes(e.code) && !e.repeat) this.jumpQueued = true;
    if (JUMP.includes(e.code) || e.code.startsWith('Arrow')) e.preventDefault();
    this.down.add(e.code);
  };

  private onKeyUp = (e: KeyboardEvent): void => {
    this.down.delete(e.code);
  };

  private onBlur = (): void => {
    this.down.clear();
  };

  private onClick = (): void => {
    if (this.pointerLocked) return;
    // Chrome returns a promise that rejects if the lock is refused (e.g. clicked right after Esc).
    const request = this.element.requestPointerLock() as Promise<void> | undefined;
    request?.catch(() => {});
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
