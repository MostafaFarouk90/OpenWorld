import { ACTIONS, ACTION_DEFS, bindingToken } from './actions';
import type { Action, ActionState } from './actions';
import type { InputBindings } from './InputBindings';
import type { InputContexts } from './InputContexts';

/** An ActionState that also tells the order in which actions were pressed (higher = later). */
export interface SampledActions extends ActionState {
  pressSeq(a: Action): number;
  /** `performance.now()` time of the first press latched since the previous sample; null when not pressed this tick. */
  pressedAtMs(a: Action): number | null;
}

const now = (): number => (typeof performance !== 'undefined' ? performance.now() : Date.now());

export interface ActionMapOptions {
  /** Left mouse counts for attack1 only while this returns true. */
  pointerLocked?: () => boolean;
}

/** Turns raw key and mouse events into per-tick action state (contracts/input-and-hud.md sections 2 and 3). */
export class ActionMap {
  private readonly physical = new Set<string>();
  /** Inputs that were down when the context changed; ignored until released. */
  private readonly ignored = new Set<string>();
  private readonly pressedLatch = new Set<Action>();
  private readonly seq = new Map<Action, number>();
  private readonly pressedAt = new Map<Action, number>();
  private readonly prevDown = new Map<Action, boolean>();
  private readonly held = new Map<Action, number>();
  private counter = 0;
  private filter: ((a: Action) => boolean) | null = null;
  private readonly pointerLocked: () => boolean;

  constructor(
    private readonly bindings: InputBindings,
    private readonly contexts: InputContexts,
    opts: ActionMapOptions = {},
  ) {
    this.pointerLocked = opts.pointerLocked ?? (() => true);
    contexts.onChange(() => {
      for (const t of this.physical) this.ignored.add(t);
      this.pressedLatch.clear();
      this.pressedAt.clear();
    });
  }

  setActionFilter(fn: ((a: Action) => boolean) | null): void {
    this.filter = fn;
  }

  /** `timeMs` is the event's `timeStamp` (same clock as `performance.now()`); omitted means now. */
  keyDown(code: string, repeat = false, timeMs?: number): void {
    this.press(`k:${code}`, repeat, timeMs);
  }

  keyUp(code: string): void {
    this.release(`k:${code}`);
  }

  mouseDown(button: number, timeMs?: number): void {
    if (button === 0 && !this.pointerLocked()) return;
    this.press(`m:${button}`, false, timeMs);
  }

  mouseUp(button: number): void {
    this.release(`m:${button}`);
  }

  blur(): void {
    this.physical.clear();
    this.ignored.clear();
  }

  sample(): SampledActions {
    const n = ACTIONS.length;
    const down = new Array<boolean>(n);
    const pressed = new Array<boolean>(n);
    const released = new Array<boolean>(n);
    const ticks = new Array<number>(n);
    const order = new Array<number>(n);
    const at = new Array<number | null>(n);
    const top = this.contexts.top();
    ACTIONS.forEach((a, i) => {
      const allowed = ACTION_DEFS[a].contexts.includes(top) && (this.filter ? this.filter(a) : true);
      const was = this.prevDown.get(a) ?? false;
      const isDown = allowed && this.isHeld(a);
      const latched = allowed && this.pressedLatch.has(a);
      const isPressed = latched;
      down[i] = isDown;
      pressed[i] = isPressed;
      released[i] = (was && !isDown) || (latched && !isDown);
      ticks[i] = isDown ? (this.held.get(a) ?? 0) + 1 : 0;
      order[i] = isPressed ? (this.seq.get(a) ?? 0) : 0;
      at[i] = isPressed ? (this.pressedAt.get(a) ?? null) : null;
      this.prevDown.set(a, isDown);
      this.held.set(a, ticks[i]);
    });
    this.pressedLatch.clear();
    this.pressedAt.clear();
    const idx = (a: Action): number => ACTIONS.indexOf(a);
    const isD = (a: Action): boolean => down[idx(a)] ?? false;
    return Object.freeze({
      down: isD,
      pressed: (a: Action) => pressed[idx(a)] ?? false,
      released: (a: Action) => released[idx(a)] ?? false,
      heldTicks: (a: Action) => ticks[idx(a)] ?? 0,
      axis: (neg: Action, pos: Action): -1 | 0 | 1 => ((isD(pos) ? 1 : 0) - (isD(neg) ? 1 : 0)) as -1 | 0 | 1,
      pressSeq: (a: Action) => order[idx(a)] ?? 0,
      pressedAtMs: (a: Action) => at[idx(a)] ?? null,
    });
  }

  private isHeld(a: Action): boolean {
    for (const b of this.bindings.get(a)) {
      if (!b) continue;
      const t = bindingToken(b);
      if (this.physical.has(t) && !this.ignored.has(t)) return true;
    }
    return false;
  }

  private press(token: string, repeat: boolean, timeMs?: number): void {
    const already = this.physical.has(token);
    this.physical.add(token);
    if (repeat || already || this.ignored.has(token)) return;
    const top = this.contexts.top();
    for (const a of ACTIONS) {
      if (!ACTION_DEFS[a].contexts.includes(top)) continue;
      if (this.bindings.get(a).some((b) => b !== null && bindingToken(b) === token)) {
        this.pressedLatch.add(a);
        this.seq.set(a, ++this.counter);
        if (!this.pressedAt.has(a)) this.pressedAt.set(a, Number.isFinite(timeMs) ? (timeMs as number) : now());
      }
    }
  }

  private release(token: string): void {
    this.physical.delete(token);
    this.ignored.delete(token);
  }
}
