import { CAMERA } from '../../config/constants';
import { LOCK_ON } from '../../player/tuning';
import type { Action, InputContext } from '../actions';
import type { PadBindings } from './PadBindings';
import { PAD, PAD_BUTTON_COUNT, PAD_TOGGLE_ACTIONS, STICK_TOKENS, actionToken, chordToken } from './padLayout';

/** The parts of the W3C `Gamepad` the game reads (tests pass plain objects). */
export interface GamepadLike {
  readonly id: string;
  readonly index: number;
  readonly mapping: string;
  readonly connected: boolean;
  readonly buttons: readonly { readonly pressed: boolean; readonly value: number }[];
  readonly axes: readonly number[];
  readonly vibrationActuator?: {
    playEffect?(type: string, params: Record<string, number>): Promise<unknown> | unknown;
  } | null;
}

/** Where pad presses go: the ActionMap token API (InputManager wires it). */
export interface PadSink {
  tokenDown(token: string, timeMs?: number): void;
  tokenUp(token: string): void;
  isTokenHeld(token: string): boolean;
}

export interface PadHost {
  /** `navigator.getGamepads()`; null when the API is missing. */
  getGamepads(): readonly (GamepadLike | null)[] | null;
  sink: PadSink;
  bindings: PadBindings;
  context(): InputContext;
  /** The Calm prompt holds the wheel: D-pad left/right then step offerings instead of their actions. */
  wheelClaimed(): boolean;
  addWheel(steps: number): void;
  now(): number;
}

/**
 * Something that takes pad buttons before the bindings do (the menu navigator, the radials). Returns true to
 * consume the press; a consumed press's release goes to the same interceptor.
 */
export interface PadInterceptor {
  id: string;
  onButton(button: number, down: boolean, pad: GamepadInput): boolean;
}

export const STICK_DEAD_ZONE = 0.2;
export const STICK_OUTER = 0.95;
/**
 * A stick component holds its move direction when it is at least this share of the stick's length (about 11.5
 * degrees off the other axis); nearer the axis it snaps to the axis, keeping the push's magnitude.
 */
export const MOVE_AXIS_SHARE = 0.2;
/** Right stick full deflection in camera radians per second (yaw, pitch) at sensitivity 1. */
export const LOOK_RATE = { yaw: 2.8, pitch: 1.7 };
/** Mouse pixels to radians in the camera (CAMERA.mouseSensitivity); look is fed to it as pixels. */
export const LOOK_PIXELS_PER_RADIAN = 1 / CAMERA.mouseSensitivity;
/** Right stick x past this while locked on is a flick: one target switch. */
export const FLICK_THRESHOLD = 0.7;

export type Stick = { x: number; y: number; mag: number };

/** Radial dead zone and rescale: 0 inside the dead zone, then 0..1 up to the outer ring; y up is positive. */
export function shapeStick(rawX: number, rawY: number): Stick {
  const x = Number.isFinite(rawX) ? rawX : 0;
  const y = Number.isFinite(rawY) ? -rawY : 0;
  const len = Math.hypot(x, y);
  if (len <= STICK_DEAD_ZONE) return { x: 0, y: 0, mag: 0 };
  const mag = Math.min(1, (len - STICK_DEAD_ZONE) / (STICK_OUTER - STICK_DEAD_ZONE));
  return { x: (x / len) * mag, y: (y / len) * mag, mag };
}

/**
 * G2 gamepad input. Polls the first connected standard-mapping pad, turns button edges into ActionMap tokens
 * (LB layer resolved at press time, sprint and sneak as toggles), shapes the sticks, and tracks whether the pad
 * is the device in use so prompts can show pad glyphs.
 */
export class GamepadInput {
  private padIndex: number | null = null;
  private readonly prev = new Array<boolean>(PAD_BUTTON_COUNT).fill(false);
  /** What each held button resolved to at press time. */
  private readonly heldAs = new Map<number, { token?: string; interceptor?: PadInterceptor; wheel?: boolean }>();
  private readonly toggled = new Map<Action, string>();
  private readonly interceptors: PadInterceptor[] = [];
  private readonly deviceListeners = new Set<(pad: boolean) => void>();
  private readonly unsupportedListeners = new Set<(id: string) => void>();
  private readonly warnedUnsupported = new Set<string>();
  private left: Stick = { x: 0, y: 0, mag: 0 };
  private right: Stick = { x: 0, y: 0, mag: 0 };
  private lookX = 0;
  private lookY = 0;
  private stickTokens = new Set<string>();
  private padActive = false;
  private flicked = false;
  private prevLeftMag = 0;
  private prevRightMag = 0;
  private lastContext: InputContext | null = null;
  /** Look settings (G1 SettingsStore keys padLookSensitivity, padInvertY). */
  sensitivity = 1;
  invertY = false;
  /** Set by the plugin: true while the camera is locked on (right stick x then flicks targets). */
  lockedOn: () => boolean = () => false;
  /** Set by the radial while it is open: the right stick picks a wedge and does not move the camera. */
  lookSuppressed = false;
  /** Set by the plugin: true while G1's pause menu is open (look stops, as mouse look does behind a modal). */
  lookBlocked: () => boolean = () => false;

  constructor(private readonly host: PadHost) {}

  /** The pad in use, or null. */
  get gamepad(): GamepadLike | null {
    const pads = this.pads();
    return this.padIndex === null ? null : (pads?.find((p) => p?.index === this.padIndex) ?? null);
  }

  get connected(): boolean {
    return this.padIndex !== null;
  }

  /** True when the pad was the last device used (prompts then show pad glyphs). */
  get active(): boolean {
    return this.padActive;
  }

  /** The shaped left stick (x right, y forward). */
  get leftStick(): Stick {
    return this.left;
  }

  /** The left stick as a move: within MOVE_AXIS_SHARE of an axis it snaps to that axis, keeping its magnitude. */
  get move(): { x: number; y: number } {
    const { x, y, mag } = this.left;
    if (mag === 0) return { x: 0, y: 0 };
    const keepX = Math.abs(x) >= MOVE_AXIS_SHARE * mag;
    const keepY = Math.abs(y) >= MOVE_AXIS_SHARE * mag;
    if (keepX && keepY) return { x, y };
    return keepX ? { x: Math.sign(x) * mag, y: 0 } : { x: 0, y: Math.sign(y) * mag };
  }

  /** The shaped right stick (x right, y up). */
  get rightStick(): Stick {
    return this.right;
  }

  isDown(button: number): boolean {
    return this.prev[button] ?? false;
  }

  /** Called by InputManager on a real key, mouse button or mouse move: the keyboard is the device again. */
  noteKeyboardMouse(): void {
    this.setActive(false);
  }

  onDeviceChange(fn: (pad: boolean) => void): () => void {
    this.deviceListeners.add(fn);
    return () => this.deviceListeners.delete(fn);
  }

  /** Fires once per pad id that is not standard-mapped (the plugin shows a toast). */
  onUnsupported(fn: (id: string) => void): () => void {
    this.unsupportedListeners.add(fn);
    return () => this.unsupportedListeners.delete(fn);
  }

  /** Interceptors added later are asked first. */
  intercept(i: PadInterceptor): () => void {
    this.interceptors.push(i);
    return () => {
      const k = this.interceptors.indexOf(i);
      if (k >= 0) this.interceptors.splice(k, 1);
      for (const [button, h] of this.heldAs) if (h.interceptor === i) this.heldAs.delete(button);
    };
  }

  /** Presses and releases one action at once (radials); it latches as pressed for the next tick. */
  tapAction(a: Action): void {
    const t = actionToken(a);
    this.host.sink.tokenDown(t, this.host.now());
    this.host.sink.tokenUp(t);
  }

  /** Right-stick look in mouse pixels since the last call (the camera drains it with the mouse delta). */
  consumeLook(): { dx: number; dy: number } {
    const d = { dx: this.lookX, dy: this.lookY };
    this.lookX = 0;
    this.lookY = 0;
    return d;
  }

  /** Polls the pad. `dtSeconds` > 0 also integrates right-stick look (once per rendered frame). */
  poll(dtSeconds = 0): void {
    const pad = this.choosePad();
    if (!pad) {
      if (this.padIndex !== null) this.disconnect();
      return;
    }
    const now = this.host.now();
    const ctx = this.host.context();
    if (ctx !== this.lastContext) {
      // A context change makes the ActionMap ignore held tokens; toggles would then be on in name only.
      if (this.lastContext !== null) this.dropToggles();
      this.lastContext = ctx;
    }
    for (let i = 0; i < PAD_BUTTON_COUNT; i++) {
      const btn = pad.buttons[i];
      const down = !!btn && (btn.pressed || btn.value > 0.5);
      if (down === this.prev[i]) continue;
      this.prev[i] = down;
      this.setActive(true);
      if (down) this.press(i, now);
      else this.release(i);
    }
    this.left = shapeStick(pad.axes[0] ?? 0, pad.axes[1] ?? 0);
    this.right = shapeStick(pad.axes[2] ?? 0, pad.axes[3] ?? 0);
    // Only a fresh deflection switches the device: a stick held still while the mouse moves does not flip-flop.
    if ((this.left.mag > 0 && this.prevLeftMag === 0) || (this.right.mag > 0 && this.prevRightMag === 0)) this.setActive(true);
    this.updateStickTokens(now);
    this.updateLook(dtSeconds);
    this.resyncToggles();
    this.prevLeftMag = this.left.mag;
    this.prevRightMag = this.right.mag;
  }

  /** Drops every held pad input (pad unplugged, plugin disposed). */
  releaseAll(): void {
    for (const b of [...this.heldAs.keys()]) this.release(b);
    this.dropToggles();
    for (const t of this.stickTokens) this.host.sink.tokenUp(t);
    this.stickTokens.clear();
    this.prev.fill(false);
    this.left = { x: 0, y: 0, mag: 0 };
    this.right = { x: 0, y: 0, mag: 0 };
    this.lookX = 0;
    this.lookY = 0;
    this.prevLeftMag = 0;
    this.prevRightMag = 0;
  }

  private dropToggles(): void {
    for (const t of this.toggled.values()) this.host.sink.tokenUp(t);
    this.toggled.clear();
  }

  private pads(): readonly (GamepadLike | null)[] | null {
    try {
      return this.host.getGamepads();
    } catch {
      return null;
    }
  }

  private choosePad(): GamepadLike | null {
    const pads = this.pads();
    if (!pads) return null;
    if (this.padIndex !== null) {
      const same = pads.find((p) => p?.index === this.padIndex);
      if (same && same.connected) return same;
    }
    for (const p of pads) {
      if (!p || !p.connected) continue;
      if (p.mapping !== 'standard') {
        if (!this.warnedUnsupported.has(p.id)) {
          this.warnedUnsupported.add(p.id);
          for (const l of [...this.unsupportedListeners]) l(p.id);
        }
        continue;
      }
      if (this.padIndex !== null && this.padIndex !== p.index) this.disconnect();
      this.padIndex = p.index;
      return p;
    }
    return null;
  }

  private disconnect(): void {
    this.releaseAll();
    this.padIndex = null;
    this.setActive(false);
  }

  private setActive(on: boolean): void {
    if (this.padActive === on) return;
    this.padActive = on;
    for (const l of [...this.deviceListeners]) l(on);
  }

  private press(button: number, now: number): void {
    for (let k = this.interceptors.length - 1; k >= 0; k--) {
      const i = this.interceptors[k];
      if (i.onButton(button, true, this)) {
        this.heldAs.set(button, { interceptor: i });
        return;
      }
    }
    if ((button === PAD.LEFT || button === PAD.RIGHT) && !this.prev[PAD.LB] && this.host.wheelClaimed()) {
      this.host.addWheel(button === PAD.LEFT ? -1 : 1);
      this.heldAs.set(button, { wheel: true });
      return;
    }
    const b = this.host.bindings;
    const layer = this.prev[PAD.LB] && b.hasLbLayer(button) ? 'lb' : 'base';
    const token = chordToken({ button, layer });
    const ctx = this.host.context();
    const toggles = b.actionsFor({ button, layer }, ctx).filter((a) => PAD_TOGGLE_ACTIONS.includes(a));
    if (toggles.length) {
      for (const a of toggles) {
        const on = this.toggled.get(a);
        if (on) {
          this.host.sink.tokenUp(on);
          this.toggled.delete(a);
        } else {
          const t = actionToken(a);
          this.host.sink.tokenDown(t, now);
          this.toggled.set(a, t);
        }
      }
      this.heldAs.set(button, {});
      return;
    }
    this.host.sink.tokenDown(token, now);
    this.heldAs.set(button, { token });
  }

  private release(button: number): void {
    const h = this.heldAs.get(button);
    this.heldAs.delete(button);
    if (!h) return;
    if (h.interceptor) h.interceptor.onButton(button, false, this);
    else if (h.token) this.host.sink.tokenUp(h.token);
  }

  private updateStickTokens(now: number): void {
    const want = new Set<string>();
    if (this.host.context() !== 'menu') {
      const m = this.move;
      if (m.y > 0) want.add(STICK_TOKENS.moveForward);
      if (m.y < 0) want.add(STICK_TOKENS.moveBack);
      if (m.x > 0) want.add(STICK_TOKENS.moveRight);
      if (m.x < 0) want.add(STICK_TOKENS.moveLeft);
    }
    for (const t of this.stickTokens) if (!want.has(t)) this.host.sink.tokenUp(t);
    for (const t of want) if (!this.stickTokens.has(t)) this.host.sink.tokenDown(t, now);
    this.stickTokens = want;
    // Sprint toggled on the pad ends when the stick returns to centre (not when L3 is clicked with it centred).
    const sprint = this.toggled.get('sprint');
    if (sprint && this.left.mag === 0 && this.prevLeftMag > 0) {
      this.host.sink.tokenUp(sprint);
      this.toggled.delete('sprint');
    }
  }

  private updateLook(dt: number): void {
    if (this.host.context() !== 'gameplay' || this.lookBlocked()) {
      // Behind a menu, dialogue, a cutscene or the pause menu the camera does not turn (mouse look stops there too).
      this.lookX = 0;
      this.lookY = 0;
      this.flicked = Math.abs(this.right.x) >= FLICK_THRESHOLD;
      return;
    }
    const locked = this.lockedOn();
    const rx = this.right.x;
    if (locked && !this.lookSuppressed) {
      // While locked the stick does not turn the camera; a flick past the threshold switches target once.
      if (!this.flicked && Math.abs(rx) >= FLICK_THRESHOLD) {
        this.flicked = true;
        this.lookX += Math.sign(rx) * (LOCK_ON.swapMousePixels + 1);
      } else if (Math.abs(rx) < FLICK_THRESHOLD * 0.5) this.flicked = false;
      return;
    }
    this.flicked = Math.abs(rx) >= FLICK_THRESHOLD;
    if (!(dt > 0) || this.lookSuppressed || this.right.mag === 0) return;
    // Squared response: fine aim near the centre, full speed at the rim.
    const curve = this.right.mag;
    const sx = (this.right.x / (this.right.mag || 1)) * curve * curve;
    const sy = (this.right.y / (this.right.mag || 1)) * curve * curve;
    const s = Math.min(2, Math.max(0.5, Number.isFinite(this.sensitivity) ? this.sensitivity : 1));
    // Camera: dx right turns right; dy positive looks down (mouse convention). Stick up looks up unless inverted.
    this.lookX += sx * LOOK_RATE.yaw * LOOK_PIXELS_PER_RADIAN * s * dt;
    this.lookY += (this.invertY ? sy : -sy) * LOOK_RATE.pitch * LOOK_PIXELS_PER_RADIAN * s * dt;
  }

  private resyncToggles(): void {
    // A window blur clears every held token; forget toggles that no longer hold.
    for (const [a, t] of [...this.toggled]) if (!this.host.sink.isTokenHeld(t)) this.toggled.delete(a);
  }
}
