import type { Action, InputContext } from '../actions';
import type { GamepadInput, PadInterceptor } from './GamepadInput';
import { PAD } from './padLayout';

/** The skill radial's wedges, clockwise from the top (design item 85: the rest of the bar on a gamepad). */
export const SKILL_WEDGES: readonly Action[] = [
  'ability1', 'ability2', 'ability3', 'ability4', 'ability5', 'ability6', 'surge', 'surgeLeap',
];
/** The screens radial on hold View. */
export const SCREEN_WEDGES: readonly Action[] = ['inventory', 'skills', 'journal', 'map', 'codex', 'party'];
/** Stick deflection needed to pick a wedge; inside it a release cancels. */
export const RADIAL_PICK = 0.5;
/** Holding View this long opens the screens radial; a shorter tap opens the inventory. */
export const VIEW_HOLD_S = 0.3;

/** The wedge index under the stick (x right, y up), clockwise from the top; -1 inside the pick dead zone. */
export function wedgeAt(x: number, y: number, count: number): number {
  if (!(count > 0) || Math.hypot(x, y) < RADIAL_PICK) return -1;
  const deg = ((Math.atan2(x, y) * 180) / Math.PI + 360) % 360;
  const size = 360 / count;
  return Math.floor(((deg + size / 2) % 360) / size);
}

export interface RadialWedge {
  action: Action;
  label: string;
  /** False: on cooldown, unaffordable or empty; picking it does nothing. */
  usable: boolean;
}

export interface RadialView {
  show(kind: 'skills' | 'screens', wedges: readonly RadialWedge[]): void;
  select(index: number): void;
  hide(): void;
}

export interface RadialDeps {
  context(): InputContext;
  wedges(kind: 'skills' | 'screens'): RadialWedge[];
  view: RadialView;
}

/**
 * G2 radials. Hold RB in gameplay: the skill radial (the world keeps running, taste call), right stick picks,
 * release fires (B cancels). Tap View: the inventory; hold View: the screens radial (either stick picks). Leaving gameplay
 * (a cutscene, dialogue, a menu) closes it without firing.
 */
export class SkillRadial implements PadInterceptor {
  readonly id = 'radial';
  private open: 'skills' | 'screens' | null = null;
  private wedges: RadialWedge[] = [];
  private selected = -1;
  private viewHeld: number | null = null;

  constructor(private readonly deps: RadialDeps) {}

  get openKind(): 'skills' | 'screens' | null {
    return this.open;
  }

  get selection(): number {
    return this.selected;
  }

  onButton(button: number, down: boolean, pad: GamepadInput): boolean {
    if (button === PAD.B && this.open) {
      if (down) this.close(pad);
      return true;
    }
    if (button !== PAD.RB && button !== PAD.VIEW) return false;
    if (down) {
      if (this.deps.context() !== 'gameplay' || this.open) return false;
      if (button === PAD.RB) this.show('skills', pad);
      else this.viewHeld = 0;
      return true;
    }
    if (button === PAD.VIEW && this.viewHeld !== null && this.open !== 'screens') {
      this.viewHeld = null;
      if (this.deps.context() === 'gameplay') pad.tapAction('inventory');
      return true;
    }
    const want = (button === PAD.RB && this.open === 'skills') || (button === PAD.VIEW && this.open === 'screens');
    if (want) this.fire(pad);
    return true;
  }

  frame(dt: number, pad: GamepadInput): void {
    if (this.deps.context() !== 'gameplay') {
      this.viewHeld = null;
      if (this.open) this.close(pad);
      return;
    }
    if (this.viewHeld !== null && !this.open) {
      this.viewHeld += dt > 0 ? dt : 0;
      if (this.viewHeld >= VIEW_HOLD_S) this.show('screens', pad);
    }
    if (!this.open) return;
    const r = pad.rightStick;
    const l = pad.leftStick;
    const s = this.open === 'screens' && l.mag > r.mag ? l : r;
    const i = wedgeAt(s.x, s.y, this.wedges.length);
    // The pick stays while the stick springs back to the centre; B cancels.
    if (i >= 0 && i !== this.selected) {
      this.selected = i;
      this.deps.view.select(i);
    }
  }

  private show(kind: 'skills' | 'screens', pad: GamepadInput): void {
    this.open = kind;
    this.wedges = this.deps.wedges(kind);
    this.selected = -1;
    this.viewHeld = null;
    pad.lookSuppressed = true;
    this.deps.view.show(kind, this.wedges);
  }

  private fire(pad: GamepadInput): void {
    const w = this.selected >= 0 ? this.wedges[this.selected] : undefined;
    this.close(pad);
    if (w && w.usable) pad.tapAction(w.action);
  }

  private close(pad: GamepadInput): void {
    this.open = null;
    this.selected = -1;
    this.wedges = [];
    pad.lookSuppressed = false;
    this.deps.view.hide();
  }
}
