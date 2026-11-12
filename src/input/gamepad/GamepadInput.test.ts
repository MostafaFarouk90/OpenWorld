import { describe, expect, it, vi } from 'vitest';
import { InputManager, PAD_SYNTHETIC } from '../InputManager';
import { applyLocks } from '../../core/Game';
import { NO_ACTIONS } from '../actions';
import type { Action, ActionState } from '../actions';
import { FakePad, padList } from './testing/fakePad';
import { PAD } from './padLayout';
import { LOOK_PIXELS_PER_RADIAN, LOOK_RATE, shapeStick } from './GamepadInput';
import { LOCK_ON } from '../../player/tuning';

function setup(...pads: (FakePad | null)[]) {
  const win = new EventTarget();
  const doc = Object.assign(new EventTarget(), { pointerLockElement: null as Element | null });
  const element = Object.assign(new EventTarget(), { requestPointerLock: vi.fn(), requestFullscreen: vi.fn() }) as unknown as HTMLElement;
  const list = padList(...pads);
  const input = new InputManager(element, win, doc, { storage: null, getGamepads: list.get });
  return { win, element, input, list, pad: pads[0] as FakePad };
}
const kd = (w: EventTarget, code: string, extra: Record<string, unknown> = {}) =>
  w.dispatchEvent(Object.assign(new Event('keydown'), { code, repeat: false, preventDefault() {} }, extra));
const ku = (w: EventTarget, code: string) => w.dispatchEvent(Object.assign(new Event('keyup'), { code }));

describe('GamepadInput buttons', () => {
  it('a press latches once, holds while down and releases', () => {
    const { input, pad } = setup(new FakePad());
    pad.set(PAD.A, true);
    let a = input.sampleTick().actions;
    expect(a.pressed('jump')).toBe(true);
    a = input.sampleTick().actions;
    expect(a.pressed('jump')).toBe(false);
    expect(a.down('jump')).toBe(true);
    expect(a.heldTicks('jump')).toBe(2);
    pad.set(PAD.A, false);
    a = input.sampleTick().actions;
    expect(a.down('jump')).toBe(false);
    expect(a.released('jump')).toBe(true);
  });

  it('snapshot jump and attack come from the pad', () => {
    const { input, pad } = setup(new FakePad());
    pad.set(PAD.A, true).set(PAD.RT, true);
    const s = input.sampleTick().snapshot;
    expect(s.jump).toBe(true);
    expect(s.attack).toBe(1);
  });

  it('the pad and the keyboard drive the same action at once', () => {
    const { input, pad, win } = setup(new FakePad());
    kd(win, 'KeyF');
    pad.set(PAD.X, true);
    const a = input.sampleTick().actions;
    expect(a.down('interact')).toBe(true);
    ku(win, 'KeyF');
    expect(input.sampleTick().actions.down('interact')).toBe(true); // the pad still holds it
  });

  it('LB layer: LB+A is ability1, not jump, and releasing LB first does not leak a jump', () => {
    const { input, pad } = setup(new FakePad());
    pad.set(PAD.LB, true);
    input.sampleTick();
    pad.set(PAD.A, true);
    let a = input.sampleTick().actions;
    expect(a.pressed('ability1')).toBe(true);
    expect(a.down('jump')).toBe(false);
    pad.set(PAD.LB, false);
    a = input.sampleTick().actions;
    expect(a.down('jump')).toBe(false);
    expect(a.down('ability1')).toBe(true);
    pad.set(PAD.A, false);
    expect(input.sampleTick().actions.down('ability1')).toBe(false);
  });

  it('LB on a button with no LB chord falls back to the base chord', () => {
    const { input, pad } = setup(new FakePad());
    pad.set(PAD.LB, true);
    input.sampleTick();
    pad.set(PAD.LT, false).set(PAD.RS, true); // RS has no LB chord
    expect(input.sampleTick().actions.pressed('lockOn')).toBe(true);
  });

  it('a context change ignores a held pad button until it is released', () => {
    const { input, pad } = setup(new FakePad());
    pad.set(PAD.X, true);
    input.sampleTick();
    const pop = input.contexts.push('dialogue', 'test');
    pop();
    let a = input.sampleTick().actions;
    expect(a.down('interact')).toBe(false);
    pad.set(PAD.X, false);
    input.sampleTick();
    pad.set(PAD.X, true);
    a = input.sampleTick().actions;
    expect(a.pressed('interact')).toBe(true);
  });

  it('A is dialogueNext in dialogue and jump in gameplay', () => {
    const { input, pad } = setup(new FakePad());
    input.contexts.push('dialogue', 'test');
    pad.set(PAD.A, true);
    const a = input.sampleTick().actions;
    expect(a.pressed('dialogueNext')).toBe(true);
    expect(a.pressed('jump')).toBe(false);
  });

  it('Start is the menu action in every context', () => {
    const { input, pad } = setup(new FakePad());
    input.contexts.push('cutscene', 'test');
    pad.set(PAD.START, true);
    expect(input.sampleTick().actions.pressed('menu')).toBe(true);
  });

  it('sprint toggles on L3 and ends when the stick returns to centre', () => {
    const { input, pad } = setup(new FakePad());
    pad.left(0, 1).set(PAD.LS, true);
    expect(input.sampleTick().actions.down('sprint')).toBe(true);
    pad.set(PAD.LS, false);
    expect(input.sampleTick().actions.down('sprint')).toBe(true);
    expect(input.sampleTick().snapshot.sprint).toBe(true);
    pad.left(0, 0);
    expect(input.sampleTick().actions.down('sprint')).toBe(false);
  });

  it('sneak toggles on D-pad down: first press on, second off', () => {
    const { input, pad } = setup(new FakePad());
    pad.set(PAD.DOWN, true);
    input.sampleTick();
    pad.set(PAD.DOWN, false);
    expect(input.sampleTick().actions.down('sneak')).toBe(true);
    pad.set(PAD.DOWN, true);
    expect(input.sampleTick().actions.down('sneak')).toBe(false);
  });

  it('mercy is a hold on D-pad up', () => {
    const { input, pad } = setup(new FakePad());
    pad.set(PAD.UP, true);
    for (let i = 0; i < 30; i++) input.sampleTick();
    expect(input.sampleTick().actions.heldTicks('mercy')).toBe(31);
  });

  it('while the Calm prompt claims the wheel, D-pad left/right step offerings and do not mount', () => {
    const { input, pad } = setup(new FakePad());
    const release = input.claimWheel('calm');
    pad.set(PAD.RIGHT, true);
    let a = input.sampleTick().actions;
    expect(a.pressed('mount')).toBe(false);
    expect(input.consumeWheel('calm')).toBe(1);
    pad.set(PAD.RIGHT, false).set(PAD.LEFT, true);
    a = input.sampleTick().actions;
    expect(a.pressed('surgeLeap')).toBe(false);
    expect(input.consumeWheel('calm')).toBe(-1);
    release();
    pad.set(PAD.LEFT, false);
    input.sampleTick();
    pad.set(PAD.RIGHT, true);
    expect(input.sampleTick().actions.pressed('mount')).toBe(true);
  });
});

describe('GamepadInput devices', () => {
  it('no Gamepad API, or no pads, is a no-op', () => {
    const { input } = setup();
    expect(() => input.sampleTick()).not.toThrow();
    expect(input.pad.connected).toBe(false);
    const win = new EventTarget();
    const doc = Object.assign(new EventTarget(), { pointerLockElement: null as Element | null });
    const el = Object.assign(new EventTarget(), { requestPointerLock: vi.fn() }) as unknown as HTMLElement;
    const none = new InputManager(el, win, doc, { storage: null, getGamepads: () => null });
    expect(none.sampleTick().snapshot.moveForward).toBe(0);
    const throws = new InputManager(el, win, doc, { storage: null, getGamepads: () => { throw new Error('denied'); } });
    expect(() => throws.sampleTick()).not.toThrow();
  });

  it('unplugging mid-hold releases everything', () => {
    const { input, pad, list } = setup(new FakePad());
    pad.set(PAD.LT, true).left(0, 1);
    expect(input.sampleTick().actions.down('block')).toBe(true);
    list.pads = [];
    const s = input.sampleTick();
    expect(s.actions.down('block')).toBe(false);
    expect(s.snapshot.moveForward).toBe(0);
    expect(input.pad.connected).toBe(false);
  });

  it('a non-standard pad is refused with one notice per pad; a standard one after it is used', () => {
    const odd = Object.assign(new FakePad(0), { mapping: '', id: 'Odd stick' });
    const good = new FakePad(1);
    const { input } = setup(odd, good);
    const seen = vi.fn();
    input.pad.onUnsupported(seen);
    good.set(PAD.A, true);
    expect(input.sampleTick().actions.pressed('jump')).toBe(true);
    input.sampleTick();
    expect(seen).toHaveBeenCalledTimes(1);
    expect(seen).toHaveBeenCalledWith('Odd stick');
  });

  it('two pads: the first one wins until it disconnects', () => {
    const p0 = new FakePad(0);
    const p1 = new FakePad(1);
    const { input, list } = setup(p0, p1);
    p1.set(PAD.A, true);
    expect(input.sampleTick().actions.pressed('jump')).toBe(false);
    list.pads = [null, p1];
    p1.set(PAD.A, false);
    input.sampleTick();
    p1.set(PAD.A, true);
    expect(input.sampleTick().actions.pressed('jump')).toBe(true);
  });

  it('device switching flips glyphs and fires onChange once each way', () => {
    const { input, pad, win } = setup(new FakePad());
    const changed = vi.fn();
    input.bindings.onChange(changed);
    expect(input.bindings.glyph('jump')).toBe('Space');
    pad.set(PAD.A, true);
    input.sampleTick();
    expect(input.bindings.glyph('jump')).toBe('A');
    expect(input.bindings.glyph('ability1')).toBe('LB+A');
    expect(input.bindings.glyph('mercy')).toBe('D-pad up');
    expect(changed).toHaveBeenCalledTimes(1);
    input.sampleTick();
    expect(changed).toHaveBeenCalledTimes(1);
    kd(win, 'KeyW');
    expect(input.bindings.glyph('jump')).toBe('Space');
    expect(changed).toHaveBeenCalledTimes(2);
  });

  it('untrusted (synthetic) keys do not switch the device back', () => {
    const { input, pad, win } = setup(new FakePad());
    pad.set(PAD.A, true);
    input.sampleTick();
    kd(win, 'ArrowDown', { [PAD_SYNTHETIC]: true });
    expect(input.pad.active).toBe(true);
  });
});

describe('GamepadInput sticks', () => {
  it('shapeStick: dead zone, rescale, clamp, NaN', () => {
    expect(shapeStick(0.1, 0.1)).toEqual({ x: 0, y: 0, mag: 0 });
    const full = shapeStick(1, 0);
    expect(full.mag).toBe(1);
    expect(full.x).toBeCloseTo(1);
    const diag = shapeStick(1, -1);
    expect(Math.hypot(diag.x, diag.y)).toBeCloseTo(1);
    expect(diag.y).toBeGreaterThan(0); // API y down is negated: up is positive
    expect(shapeStick(NaN, NaN).mag).toBe(0);
  });

  it('a light push gives a slower analog move that survives applyLocks; keyboard stays -1/0/+1', () => {
    const { input, pad, win } = setup(new FakePad());
    pad.left(0, 0.5);
    const { snapshot, actions } = input.sampleTick();
    expect(snapshot.moveForward).toBeGreaterThan(0.3);
    expect(snapshot.moveForward).toBeLessThan(0.6);
    expect(applyLocks(snapshot, actions).moveForward).toBeCloseTo(snapshot.moveForward);
    pad.left(0, 0);
    input.sampleTick();
    kd(win, 'KeyW');
    kd(win, 'KeyA');
    const k = input.sampleTick();
    expect(applyLocks(k.snapshot, k.actions)).toMatchObject({ moveForward: 1, moveRight: -1 });
  });

  it('applyLocks zeroes an analog axis whose action is locked', () => {
    const locked: ActionState = { ...NO_ACTIONS, axis: () => 0 };
    expect(applyLocks({ moveRight: 0.4, moveForward: -0.7, sprint: false, jump: false, attack: 0 }, locked)).toMatchObject({
      moveRight: 0,
      moveForward: 0,
    });
    const pressing = (dir: Action) => ({ ...NO_ACTIONS, axis: (n: Action, p: Action) => (p === dir ? 1 : n === dir ? -1 : 0) }) as ActionState;
    expect(applyLocks({ moveRight: 0.4, moveForward: 0, sprint: false, jump: false, attack: 0 }, pressing('moveRight')).moveRight).toBe(0.4);
    expect(applyLocks({ moveRight: 1, moveForward: 0, sprint: false, jump: false, attack: 0 }, pressing('moveRight')).moveRight).toBe(1);
  });

  it('the left stick does nothing in a menu', () => {
    const { input, pad } = setup(new FakePad());
    input.contexts.push('menu', 'test');
    pad.left(1, 1);
    expect(input.sampleTick().snapshot).toMatchObject({ moveForward: 0, moveRight: 0 });
  });

  it('right stick looks: scaled by frame time, squared response, invert Y and sensitivity', () => {
    const { input, pad } = setup(new FakePad());
    pad.right(1, 0);
    input.pad.poll(0.5);
    let d = input.consumeMouseDelta();
    expect(d.dx).toBeCloseTo(LOOK_RATE.yaw * LOOK_PIXELS_PER_RADIAN * 0.5);
    expect(d.dy).toBeCloseTo(0);
    expect(input.consumeMouseDelta()).toEqual({ dx: 0, dy: 0 });
    pad.right(0, 1);
    input.pad.poll(0.1);
    d = input.consumeMouseDelta();
    expect(d.dy).toBeLessThan(0); // stick up looks up (mouse up)
    input.pad.invertY = true;
    input.pad.poll(0.1);
    expect(input.consumeMouseDelta().dy).toBeGreaterThan(0);
    input.pad.invertY = false;
    input.pad.sensitivity = 2;
    pad.right(0.6, 0);
    input.pad.poll(0.1);
    const fast = input.consumeMouseDelta().dx;
    input.pad.sensitivity = 1;
    input.pad.poll(0.1);
    const slow = input.consumeMouseDelta().dx;
    expect(fast).toBeCloseTo(slow * 2);
    const half = shapeStick(0.6, 0).mag;
    expect(slow).toBeCloseTo(half * half * LOOK_RATE.yaw * LOOK_PIXELS_PER_RADIAN * 0.1);
  });

  it('while locked on, a flick switches target once and holding does not keep switching', () => {
    const { input, pad } = setup(new FakePad());
    input.pad.lockedOn = () => true;
    pad.right(0.9, 0);
    input.pad.poll(0.1);
    expect(input.consumeMouseDelta().dx).toBeGreaterThan(LOCK_ON.swapMousePixels);
    for (let i = 0; i < 10; i++) input.pad.poll(0.1);
    expect(input.consumeMouseDelta().dx).toBe(0);
    pad.right(0, 0);
    input.pad.poll(0.1);
    pad.right(-0.9, 0);
    input.pad.poll(0.1);
    expect(input.consumeMouseDelta().dx).toBeLessThan(-LOCK_ON.swapMousePixels);
  });
});
