import { afterEach, describe, expect, it, vi } from 'vitest';
import { InputManager } from './InputManager';
import { NO_ACTIONS } from './actions';

function setup(storage: null | { getItem: () => null; setItem: () => void } = null) {
  const win = new EventTarget();
  const doc = Object.assign(new EventTarget(), { pointerLockElement: null as Element | null });
  const requestFullscreen = vi.fn(async () => {});
  const element = Object.assign(new EventTarget(), { requestPointerLock: vi.fn(), requestFullscreen }) as unknown as HTMLElement;
  const input = new InputManager(element, win, doc, { storage });
  const lock = () => void (doc.pointerLockElement = element as unknown as Element);
  return { win, doc, element, input, lock, requestFullscreen };
}
const ev = (t: EventTarget, type: string, props: Record<string, unknown> = {}) => {
  const preventDefault = vi.fn();
  t.dispatchEvent(Object.assign(new Event(type), { preventDefault }, props));
  return preventDefault;
};
const kd = (w: EventTarget, code: string, extra: Record<string, unknown> = {}) => ev(w, 'keydown', { code, repeat: false, ...extra });

afterEach(() => vi.unstubAllGlobals());

describe('InputManager sampleTick', () => {
  it('latestActions is NO_ACTIONS before the first sample, then the last state', () => {
    const { input, win } = setup();
    expect(input.latestActions).toBe(NO_ACTIONS);
    kd(win, 'KeyF');
    const { actions } = input.sampleTick();
    expect(input.latestActions).toBe(actions);
    expect(actions.pressed('interact')).toBe(true);
  });

  it('derives the legacy snapshot and sample() equals sampleTick().snapshot semantics', () => {
    const { input, win } = setup();
    kd(win, 'KeyW');
    kd(win, 'KeyD');
    kd(win, 'ShiftLeft');
    kd(win, 'Space');
    expect(input.sampleTick().snapshot).toEqual({ moveRight: 1, moveForward: 1, sprint: true, jump: true, attack: 0 });
    expect(input.sample()).toEqual({ moveRight: 1, moveForward: 1, sprint: true, jump: false, attack: 0 });
  });

  it('the last pressed attack wins when several are pressed in one tick', () => {
    const { input, win } = setup();
    kd(win, 'Digit3');
    kd(win, 'Digit1');
    expect(input.sample().attack).toBe(1);
    kd(win, 'Digit2');
    kd(win, 'Digit4');
    kd(win, 'Digit1', { repeat: false });
    expect(input.sample().attack).toBe(4); // Digit1 already held: a duplicate keydown is not a new press
  });

  it('left mouse attack needs pointer lock; right mouse is block', () => {
    const { input, element, lock } = setup();
    ev(element, 'mousedown', { button: 0 });
    ev(element, 'mouseup', { button: 0 });
    expect(input.sample().attack).toBe(0);
    lock();
    ev(element, 'mousedown', { button: 0 });
    expect(input.sample().attack).toBe(1);
    ev(element, 'mouseup', { button: 0 });
    ev(element, 'mousedown', { button: 2 });
    const { snapshot, actions } = input.sampleTick();
    expect(snapshot.attack).toBe(0);
    expect(actions.down('block')).toBe(true);
    ev(element, 'mouseup', { button: 2 });
    expect(input.sampleTick().actions.released('block')).toBe(true);
  });

  it('a mouseup on the window also releases', () => {
    const { input, element, win, lock } = setup();
    lock();
    ev(element, 'mousedown', { button: 2 });
    input.sample();
    ev(win, 'mouseup', { button: 2 });
    expect(input.sampleTick().actions.down('block')).toBe(false);
  });

  it('contexts gate the snapshot', () => {
    const { input, win } = setup();
    input.contexts.push('menu', 'x');
    kd(win, 'Space');
    kd(win, 'KeyW');
    expect(input.sample()).toEqual({ moveRight: 0, moveForward: 0, sprint: false, jump: false, attack: 0 });
  });

  it('rebinding changes the snapshot', () => {
    const { input, win } = setup();
    input.bindings.rebind('jump', 0, { device: 'key', code: 'KeyP' });
    kd(win, 'Space');
    expect(input.sample().jump).toBe(false);
    kd(win, 'KeyP');
    expect(input.sample().jump).toBe(true);
  });
});

describe('InputManager preventDefault and browser keys', () => {
  it('Tab, AltLeft and Ctrl+bound keys are prevented only while pointer locked', () => {
    const { win, lock } = setup();
    expect(kd(win, 'Tab')).not.toHaveBeenCalled();
    expect(kd(win, 'AltLeft')).not.toHaveBeenCalled();
    lock();
    expect(kd(win, 'Tab')).toHaveBeenCalled();
    expect(kd(win, 'AltLeft')).toHaveBeenCalled();
    expect(kd(win, 'KeyW', { ctrlKey: true })).toHaveBeenCalled();
    expect(kd(win, 'KeyW')).not.toHaveBeenCalled();
    expect(kd(win, 'KeyP', { ctrlKey: true })).not.toHaveBeenCalled(); // unbound
  });

  it('never prevents F-keys', () => {
    const { win, lock } = setup();
    lock();
    expect(kd(win, 'F3')).not.toHaveBeenCalled();
    expect(kd(win, 'F4')).not.toHaveBeenCalled();
  });

  it('prevents contextmenu and thumb-button navigation', () => {
    const { element } = setup();
    expect(ev(element, 'contextmenu')).toHaveBeenCalled();
    expect(ev(element, 'mousedown', { button: 3 })).toHaveBeenCalled();
    expect(ev(element, 'mouseup', { button: 4 })).toHaveBeenCalled();
    expect(ev(element, 'auxclick', { button: 3 })).toHaveBeenCalled();
    expect(ev(element, 'auxclick', { button: 1 })).not.toHaveBeenCalled();
    expect(ev(element, 'mouseup', { button: 2 })).not.toHaveBeenCalled();
  });

  it('dispose removes the new listeners', () => {
    const { input, element, win } = setup();
    input.dispose();
    expect(ev(element, 'contextmenu')).not.toHaveBeenCalled();
    ev(element, 'mousedown', { button: 2 });
    ev(win, 'mouseup', { button: 2 });
    expect(input.sample().attack).toBe(0);
  });
});

describe('InputManager keyboard lock', () => {
  it('is false by default', () => {
    expect(setup().input.keyboardLocked).toBe(false);
  });

  it('locks every bound key except Escape', async () => {
    const lock = vi.fn(async () => {});
    vi.stubGlobal('navigator', { keyboard: { lock, unlock: vi.fn() } });
    const { input, requestFullscreen, element } = setup();
    expect(await input.requestFullscreenAndLock()).toBe(true);
    expect(requestFullscreen).toHaveBeenCalled();
    expect(input.keyboardLocked).toBe(true);
    const codes = lock.mock.calls[0] as unknown as [string[]];
    expect(codes[0]).not.toContain('Escape');
    expect(codes[0]).toEqual(expect.arrayContaining(['KeyW', 'ControlLeft', 'Space', 'Tab', 'AltLeft', 'Digit1']));
    expect(new Set(codes[0]).size).toBe(codes[0].length);
    // A later rebind re-locks with the new list.
    input.bindings.rebind('jump', 0, { device: 'key', code: 'KeyP' });
    await Promise.resolve();
    expect(lock).toHaveBeenCalledTimes(2);
    expect((lock.mock.calls[1] as unknown as [string[]])[0]).toContain('KeyP');
    // Uses an explicit target
    const other = { requestFullscreen: vi.fn(async () => {}) } as unknown as HTMLElement;
    await input.requestFullscreenAndLock(other);
    expect(other.requestFullscreen).toHaveBeenCalled();
    void element;
  });

  it('returns false without the keyboard API or when anything throws', async () => {
    vi.stubGlobal('navigator', {});
    const a = setup();
    expect(await a.input.requestFullscreenAndLock()).toBe(false);
    expect(a.input.keyboardLocked).toBe(false);

    vi.stubGlobal('navigator', { keyboard: { lock: vi.fn(async () => { throw new Error('no'); }) } });
    const b = setup();
    expect(await b.input.requestFullscreenAndLock()).toBe(false);
    expect(b.input.keyboardLocked).toBe(false);
  });

  it('survives a refused fullscreen and a missing requestFullscreen', async () => {
    const lock = vi.fn(async () => {});
    vi.stubGlobal('navigator', { keyboard: { lock } });
    const { input, requestFullscreen } = setup();
    requestFullscreen.mockRejectedValueOnce(new Error('refused'));
    expect(await input.requestFullscreenAndLock()).toBe(true);
    const bare = { } as unknown as HTMLElement;
    expect(await input.requestFullscreenAndLock(bare)).toBe(true);
  });

  it('leaving fullscreen clears keyboardLocked', async () => {
    const unlock = vi.fn();
    vi.stubGlobal('navigator', { keyboard: { lock: vi.fn(async () => {}), unlock } });
    const { input, doc } = setup();
    await input.requestFullscreenAndLock();
    ev(doc, 'fullscreenchange');
    expect(input.keyboardLocked).toBe(false);
    expect(unlock).toHaveBeenCalled();
  });
});

describe('InputManager keyboard lock state', () => {
  it('keyboardLockSupported needs navigator.keyboard.lock and fullscreen', () => {
    vi.stubGlobal('navigator', {});
    expect(setup().input.keyboardLockSupported).toBe(false);
    vi.stubGlobal('navigator', { keyboard: {} });
    expect(setup().input.keyboardLockSupported).toBe(false);
    vi.stubGlobal('navigator', { keyboard: { lock: vi.fn() } });
    const a = setup();
    expect(a.input.keyboardLockSupported).toBe(true);
    (a.doc as unknown as { fullscreenEnabled: boolean }).fullscreenEnabled = false;
    expect(a.input.keyboardLockSupported).toBe(false);
    const noFs = new InputManager(new EventTarget() as unknown as HTMLElement, new EventTarget(), a.doc, { storage: null });
    (a.doc as unknown as { fullscreenEnabled: boolean }).fullscreenEnabled = true;
    expect(noFs.keyboardLockSupported).toBe(false);
  });

  it('is unsupported without a navigator', () => {
    vi.stubGlobal('navigator', undefined);
    expect(setup().input.keyboardLockSupported).toBe(false);
  });

  it('notifies on acquire, fullscreen exit and unlock, and can unsubscribe', async () => {
    const unlock = vi.fn();
    vi.stubGlobal('navigator', { keyboard: { lock: vi.fn(async () => {}), unlock } });
    const { input, doc } = setup();
    const seen: Array<{ supported: boolean; locked: boolean }> = [];
    const off = input.onKeyboardLockChange((s) => seen.push(s));
    await input.requestFullscreenAndLock();
    await input.requestFullscreenAndLock(); // already locked: no duplicate
    expect(seen).toEqual([{ supported: true, locked: true }]);
    ev(doc, 'fullscreenchange');
    expect(seen[1]).toEqual({ supported: true, locked: false });
    await input.requestFullscreenAndLock();
    input.unlockKeyboard();
    expect(seen.map((s) => s.locked)).toEqual([true, false, true, false]);
    expect(unlock).toHaveBeenCalledTimes(2);
    input.unlockKeyboard();
    expect(seen).toHaveLength(4);
    off();
    await input.requestFullscreenAndLock();
    expect(seen).toHaveLength(4);
  });

  it('a throwing listener does not break others; a failed re-lock notifies', async () => {
    const lock = vi.fn(async () => {});
    vi.stubGlobal('navigator', { keyboard: { lock, unlock: vi.fn() } });
    const { input } = setup();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const good = vi.fn();
    input.onKeyboardLockChange(() => { throw new Error('x'); });
    input.onKeyboardLockChange(good);
    await input.requestFullscreenAndLock();
    expect(good).toHaveBeenCalledTimes(1);
    lock.mockRejectedValueOnce(new Error('no'));
    input.bindings.rebind('jump', 0, { device: 'key', code: 'KeyP' });
    await new Promise((r) => setTimeout(r, 0));
    expect(good).toHaveBeenLastCalledWith({ supported: true, locked: false });
  });
});
