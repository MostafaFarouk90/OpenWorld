import type { InputContext } from '../actions';
import type { GamepadInput, PadInterceptor } from './GamepadInput';
import { PAD } from './padLayout';

/** The DOM the navigator needs (structural, so node tests pass stand-ins). */
export interface NavElement {
  getBoundingClientRect(): { left: number; top: number; width: number; height: number };
  click(): void;
  focus?(opts?: { preventScroll?: boolean }): void;
  classList?: { add(c: string): void; remove(c: string): void };
  isConnected?: boolean;
}
export interface NavRoot {
  querySelectorAll(selector: string): ArrayLike<NavElement>;
}

export interface MenuNavigatorDeps {
  context(): InputContext;
  /** The open modal's element, else the document (menus that are not modals). */
  root(): NavRoot | null;
  /** G1's pause menu service: closing and backing out go through it, because it pauses the fixed ticks. */
  pauseMenu(): { readonly isOpen: boolean; back(): void } | undefined;
  /** Dispatches an untrusted keydown and keyup for `code` (menus that read raw keys). */
  key(code: string, opts?: { shift?: boolean }): void;
}

/** Buttons and other things a pad can focus inside a menu. */
export const MENU_FOCUSABLE =
  'button:not([disabled]), [tabindex]:not([tabindex="-1"]), a[href], input:not([disabled]), select, [data-pad-focus]';
/** Dialogue choices (DialoguePanel renders them as clickable list items). */
export const DIALOGUE_FOCUSABLE = '.dialogue-choices li';
export const PAD_FOCUS_CLASS = 'owg-pad-focus';

/** First repeat after holding a direction, then the interval (seconds). */
export const NAV_REPEAT = { first: 0.4, every: 0.12 };

type Dir = 'up' | 'down' | 'left' | 'right';
const DIR_KEYS: Record<Dir, string> = { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight' };
const DPAD: Partial<Record<number, Dir>> = { [PAD.UP]: 'up', [PAD.DOWN]: 'down', [PAD.LEFT]: 'left', [PAD.RIGHT]: 'right' };

const centre = (r: { left: number; top: number; width: number; height: number }) => ({ x: r.left + r.width / 2, y: r.top + r.height / 2 });

function visible(el: NavElement): boolean {
  if (el.isConnected === false) return false;
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0;
}

/**
 * Picks the candidate nearest to `from` in direction `dir`: candidates must lie in that half-plane; distance along
 * the direction counts once, sideways distance twice (so the next row beats a far diagonal).
 */
export function pickInDirection<T extends NavElement>(from: T | null, list: readonly T[], dir: Dir): T | null {
  if (!list.length) return null;
  if (!from || !list.includes(from)) return list[0];
  const o = centre(from.getBoundingClientRect());
  let best: T | null = null;
  let bestScore = Infinity;
  for (const el of list) {
    if (el === from) continue;
    const c = centre(el.getBoundingClientRect());
    const dx = c.x - o.x;
    const dy = c.y - o.y;
    const along = dir === 'up' ? -dy : dir === 'down' ? dy : dir === 'left' ? -dx : dx;
    const side = dir === 'up' || dir === 'down' ? Math.abs(dx) : Math.abs(dy);
    if (along <= 0.5) continue;
    const score = along + side * 2;
    if (score < bestScore) {
      bestScore = score;
      best = el;
    }
  }
  return best ?? from;
}

/**
 * G2: drives every menu with the pad. In the `menu` context (or while G1's pause menu is open) it owns the pad:
 * D-pad and left stick move a focus ring between buttons and A clicks; menus with nothing focusable get Arrow keys
 * and Enter instead. B and Start back out (G1's `back()`, else Escape). LB / RB send Shift+Tab / Tab for tabs. In
 * dialogue it only takes the D-pad and A while choices are on screen.
 */
export class MenuNavigator implements PadInterceptor {
  readonly id = 'menu-navigator';
  private current: NavElement | null = null;
  private held: Dir | null = null;
  private heldFor = 0;
  private nextRepeat = 0;
  private stickDir: Dir | null = null;

  constructor(private readonly deps: MenuNavigatorDeps) {}

  /** The focused element (tests, diagnostics). */
  get focused(): NavElement | null {
    return this.current;
  }

  private mode(): 'menu' | 'dialogue' | null {
    if (this.deps.pauseMenu()?.isOpen || this.deps.context() === 'menu') return 'menu';
    if (this.deps.context() === 'dialogue' && this.candidates('dialogue').length > 0) return 'dialogue';
    return null;
  }

  onButton(button: number, down: boolean): boolean {
    const mode = this.mode();
    if (!down) {
      if (DPAD[button] === this.held) this.held = null;
      return true; // only releases of presses this navigator took arrive here
    }
    if (!mode) return false;
    const dir = DPAD[button];
    if (dir) {
      this.move(dir, mode);
      this.held = dir;
      this.heldFor = 0;
      this.nextRepeat = NAV_REPEAT.first;
      return true;
    }
    if (button === PAD.A) {
      this.activate(mode);
      return true;
    }
    if (mode === 'dialogue') return false;
    if (button === PAD.B || button === PAD.START) {
      const pm = this.deps.pauseMenu();
      if (pm?.isOpen) pm.back();
      else this.deps.key('Escape');
      this.current = null;
      return true;
    }
    if (button === PAD.RB) this.deps.key('Tab');
    else if (button === PAD.LB) this.deps.key('Tab', { shift: true });
    // Every other button is swallowed while a menu is up, so nothing leaks into gameplay.
    return true;
  }

  /** Once per rendered frame: held D-pad and the left stick repeat moves. */
  frame(dt: number, pad: GamepadInput): void {
    const mode = this.mode();
    if (!mode) {
      this.setFocus(null);
      this.held = null;
      this.stickDir = null;
      return;
    }
    // Drop a focus that left the screen (the menu re-rendered).
    const list = this.candidates(mode);
    if (this.current && !list.includes(this.current)) this.setFocus(null);
    // A menu opens with its first button focused, so A always acts on something the player can see marked.
    if (!this.current && list.length) this.setFocus(list[0]);
    const s = pad.leftStick;
    const sdir: Dir | null =
      s.mag < 0.5 ? null : Math.abs(s.x) > Math.abs(s.y) ? (s.x > 0 ? 'right' : 'left') : s.y > 0 ? 'up' : 'down';
    if (sdir !== this.stickDir) {
      this.stickDir = sdir;
      if (sdir && !this.held) {
        this.move(sdir, mode);
        this.heldFor = 0;
        this.nextRepeat = NAV_REPEAT.first;
      }
    }
    const dir = this.held ?? this.stickDir;
    if (!dir || !(dt > 0)) return;
    this.heldFor += dt;
    if (this.heldFor >= this.nextRepeat) {
      this.nextRepeat += NAV_REPEAT.every;
      this.move(dir, mode);
    }
  }

  private candidates(mode: 'menu' | 'dialogue'): NavElement[] {
    const root = this.deps.root();
    if (!root) return [];
    const list = Array.from(root.querySelectorAll(mode === 'dialogue' ? DIALOGUE_FOCUSABLE : MENU_FOCUSABLE));
    return list.filter(visible);
  }

  private move(dir: Dir, mode: 'menu' | 'dialogue'): void {
    const list = this.candidates(mode);
    if (!list.length) {
      this.deps.key(DIR_KEYS[dir]);
      return;
    }
    this.setFocus(pickInDirection(this.current, list, dir));
  }

  private activate(mode: 'menu' | 'dialogue'): void {
    const list = this.candidates(mode);
    if (this.current && list.includes(this.current)) {
      this.current.click();
      return;
    }
    if (list.length) {
      // Nothing focused yet (no frame since the menu opened): focus first, never click an unmarked button.
      this.setFocus(list[0]);
      return;
    }
    this.deps.key('Enter');
  }

  private setFocus(el: NavElement | null): void {
    if (el === this.current) return;
    this.current?.classList?.remove(PAD_FOCUS_CLASS);
    this.current = el;
    if (el) {
      el.classList?.add(PAD_FOCUS_CLASS);
      try {
        el.focus?.({ preventScroll: false });
      } catch {
        /* not focusable (a list item): the ring still shows */
      }
    }
  }
}
