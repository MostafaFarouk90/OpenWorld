import { describe, expect, it, vi } from 'vitest';
import type { InputContext } from '../actions';
import { GamepadInput } from './GamepadInput';
import { CHOICE_ARM_S, DIALOGUE_FOCUSABLE, MENU_FOCUSABLE, MenuNavigator, NAV_REPEAT, PAD_FOCUS_CLASS, pickInDirection } from './MenuNavigator';
import type { NavElement } from './MenuNavigator';
import { PadBindings } from './PadBindings';
import { PAD } from './padLayout';
import { FakePad } from './testing/fakePad';

class El implements NavElement {
  classes = new Set<string>();
  click = vi.fn();
  focus = vi.fn();
  classList = { add: (c: string) => void this.classes.add(c), remove: (c: string) => void this.classes.delete(c) };
  constructor(public name: string, public x: number, public y: number, public w = 80, public h = 20) {}
  getBoundingClientRect() {
    return { left: this.x, top: this.y, width: this.w, height: this.h };
  }
}

/** A 2x2 grid of buttons plus a hidden one, under a menu root. */
function world(opts: { ctx?: InputContext; empty?: boolean; pauseOpen?: boolean; dialogue?: El[] } = {}) {
  const a = new El('a', 0, 0);
  const b = new El('b', 100, 0);
  const c = new El('c', 0, 40);
  const d = new El('d', 100, 40);
  const hidden = new El('hidden', 0, 80, 0, 0);
  const menu = opts.empty ? [] : [a, b, c, d, hidden];
  const state = { ctx: opts.ctx ?? ('menu' as InputContext), pauseOpen: !!opts.pauseOpen, dialogue: opts.dialogue ?? [] };
  const keys: string[] = [];
  const back = vi.fn();
  const nav = new MenuNavigator({
    context: () => state.ctx,
    root: () => ({ querySelectorAll: (sel: string) => (sel === DIALOGUE_FOCUSABLE ? state.dialogue : sel === MENU_FOCUSABLE ? menu : []) }),
    pauseMenu: () => ({ isOpen: state.pauseOpen, back }),
    key: (code, o) => void keys.push(o?.shift ? `Shift+${code}` : code),
  });
  const fake = new FakePad();
  const pad = new GamepadInput({
    getGamepads: () => [fake],
    sink: { tokenDown: vi.fn(), tokenUp: vi.fn(), isTokenHeld: () => false },
    bindings: new PadBindings(null, () => {}),
    context: () => state.ctx,
    wheelClaimed: () => false,
    addWheel: () => {},
    now: () => 0,
  });
  pad.intercept(nav);
  const tap = (button: number) => {
    fake.set(button, true);
    pad.poll();
    fake.set(button, false);
    pad.poll();
  };
  /** Makes the pad the device in use (a fresh right-stick flick), as any real press would. */
  const wake = () => {
    fake.right(0.6, 0);
    pad.poll();
    fake.right(0, 0);
    pad.poll();
  };
  wake();
  return { nav, pad, fake, tap, keys, back, state, wake, els: { a, b, c, d, hidden } };
}

describe('pickInDirection', () => {
  const a = new El('a', 0, 0);
  const b = new El('b', 100, 0);
  const c = new El('c', 0, 40);
  const far = new El('far', 300, 45);
  it('moves to the nearest in the half-plane, preferring the same row or column', () => {
    expect(pickInDirection(a, [a, b, c, far], 'right')).toBe(b);
    expect(pickInDirection(a, [a, b, c, far], 'down')).toBe(c);
    expect(pickInDirection(b, [a, b, c, far], 'left')).toBe(a);
  });
  it('stays put at an edge, and starts at the first with no focus', () => {
    expect(pickInDirection(a, [a, b, c], 'up')).toBe(a);
    expect(pickInDirection(null, [b, c], 'up')).toBe(b);
    expect(pickInDirection(a, [], 'up')).toBeNull();
  });
});

describe('MenuNavigator in a menu', () => {
  it('focuses the first visible button on the first frame, moves with the D-pad and clicks with A', () => {
    const { nav, pad, tap, els } = world();
    nav.frame(0.016, pad);
    expect(nav.focused).toBe(els.a);
    expect(els.a.classes.has(PAD_FOCUS_CLASS)).toBe(true);
    tap(PAD.RIGHT);
    expect(nav.focused).toBe(els.b);
    expect(els.a.classes.has(PAD_FOCUS_CLASS)).toBe(false);
    tap(PAD.DOWN);
    expect(nav.focused).toBe(els.d);
    tap(PAD.A);
    expect(els.d.click).toHaveBeenCalledTimes(1);
  });

  it('never focuses a hidden element', () => {
    const { nav, pad, tap } = world();
    nav.frame(0.016, pad);
    tap(PAD.DOWN);
    tap(PAD.DOWN);
    tap(PAD.DOWN);
    expect(nav.focused?.getBoundingClientRect().width).toBeGreaterThan(0);
  });

  it('holding a direction repeats after the first delay; the left stick moves too', () => {
    const { nav, pad, fake, els } = world();
    nav.frame(0.016, pad);
    fake.set(PAD.RIGHT, true);
    pad.poll();
    expect(nav.focused).toBe(els.b);
    nav.frame(NAV_REPEAT.first - 0.01, pad);
    expect(nav.focused).toBe(els.b);
    fake.set(PAD.RIGHT, false);
    pad.poll();
    fake.left(0, -1);
    pad.poll();
    nav.frame(0.016, pad);
    expect(nav.focused).toBe(els.d);
  });

  it('a menu with nothing focusable gets Arrow keys and Enter', () => {
    const { tap, keys } = world({ empty: true });
    tap(PAD.UP);
    tap(PAD.A);
    expect(keys).toEqual(['ArrowUp', 'Enter']);
  });

  it('B and Start send Escape; LB / RB send Shift+Tab / Tab', () => {
    const { tap, keys } = world();
    tap(PAD.B);
    tap(PAD.START);
    tap(PAD.RB);
    tap(PAD.LB);
    expect(keys).toEqual(['Escape', 'Escape', 'Tab', 'Shift+Tab']);
  });

  it("G1's pause menu backs out through its service, not Escape (the fixed ticks are paused)", () => {
    const { tap, keys, back } = world({ ctx: 'gameplay', pauseOpen: true });
    tap(PAD.B);
    tap(PAD.START);
    expect(back).toHaveBeenCalledTimes(2);
    expect(keys).toEqual([]);
  });

  it('swallows every other button in a menu so nothing reaches gameplay', () => {
    const { pad, fake } = world();
    const sink = (pad as unknown as { host: { sink: { tokenDown: ReturnType<typeof vi.fn> } } }).host.sink;
    fake.set(PAD.RT, true).set(PAD.Y, true).set(PAD.X, true);
    pad.poll();
    expect(sink.tokenDown).not.toHaveBeenCalled();
  });

  it('stays idle for keyboard and mouse players: no focus ring, no focus moves, and the ring goes when they switch', () => {
    const { nav, pad, els } = world();
    nav.frame(0.016, pad);
    expect(nav.focused).toBe(els.a);
    pad.noteKeyboardMouse();
    nav.frame(0.016, pad);
    expect(nav.focused).toBeNull();
    expect(els.a.classes.has(PAD_FOCUS_CLASS)).toBe(false);
    expect(els.a.focus).toHaveBeenCalledTimes(1);
    nav.frame(0.016, pad);
    expect(els.a.focus).toHaveBeenCalledTimes(1);
  });

  it('does nothing in gameplay', () => {
    const { pad, fake, keys, nav } = world({ ctx: 'gameplay' });
    const sink = (pad as unknown as { host: { sink: { tokenDown: ReturnType<typeof vi.fn> } } }).host.sink;
    fake.set(PAD.B, true);
    pad.poll();
    nav.frame(0.016, pad);
    expect(keys).toEqual([]);
    expect(nav.focused).toBeNull();
    expect(sink.tokenDown).toHaveBeenCalledWith('p:base:1', 0);
  });
});

describe('MenuNavigator in dialogue', () => {
  it('with choices on screen, D-pad moves the highlight and A picks', () => {
    const c1 = new El('1', 0, 0, 300, 18);
    const c2 = new El('2', 0, 20, 300, 18);
    const { nav, pad, tap } = world({ ctx: 'dialogue', dialogue: [c1, c2] });
    nav.frame(0.016, pad);
    expect(nav.focused).toBe(c1);
    tap(PAD.DOWN);
    tap(PAD.A);
    expect(c2.click).toHaveBeenCalledTimes(1);
  });

  it('A tapped through lines does not pick a choice the moment the choices appear', () => {
    const c1 = new El('1', 0, 0, 300, 18);
    const { nav, pad, tap } = world({ ctx: 'dialogue', dialogue: [c1] });
    nav.frame(0.016, pad);
    tap(PAD.A);
    expect(c1.click).not.toHaveBeenCalled();
    nav.frame(CHOICE_ARM_S, pad);
    tap(PAD.A);
    expect(c1.click).toHaveBeenCalledTimes(1);
  });

  it('without choices, A falls through to dialogueNext', () => {
    const { pad, fake } = world({ ctx: 'dialogue' });
    const sink = (pad as unknown as { host: { sink: { tokenDown: ReturnType<typeof vi.fn> } } }).host.sink;
    fake.set(PAD.A, true);
    pad.poll();
    expect(sink.tokenDown).toHaveBeenCalledWith('p:base:0', 0);
  });
});
